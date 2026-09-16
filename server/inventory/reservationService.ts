import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryReservationRepository } from '../repositories/inventoryReservationRepository';
import { InventoryReservationRecord, ReservationStatus, Quantity } from './inventoryTypes';
import {
  parseExactQuantity,
  parseQtyToScaled,
  generateInventoryId,
} from './inventoryPolicies';

/**
 * Inventory Reservation Service (INV-001 / INV-001R3)
 * 
 * Coordinates first-class inventory reservations:
 * - Creates active reservations with atomic balance reserved updates.
 * - Enforces organization-scoped idempotency.
 * - Releases reservations, restoring available stock.
 * - Fulfills reservations on order completion.
 * - Cancels reservations explicitly.
 * - Provides transactional expiration of stale reservations.
 */
export class ReservationService {
  private inventoryRepo: InventoryRepository;
  private reservationRepo: InventoryReservationRepository;
  private db: DatabaseClient;

  constructor(
    inventoryRepo?: InventoryRepository,
    reservationRepo?: InventoryReservationRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.inventoryRepo = inventoryRepo || new InventoryRepository(this.db);
    this.reservationRepo = reservationRepo || new InventoryReservationRepository(this.db);
  }

  async createReservation(
    organizationId: string,
    data: {
      location_id: string;
      variant_id: string;
      quantity: unknown;
      reference_type: string;
      reference_id: string;
      notes?: string;
      expires_at?: string;
      idempotency_key?: string;
    },
    performed_by: string,
    explicitIdempotencyKey?: string
  ): Promise<InventoryReservationRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization context is required for createReservation.');
    }

    const idempotencyKey = explicitIdempotencyKey || data.idempotency_key || generateInventoryId('res_idem');
    const exactQty = parseExactQuantity(data.quantity, 'quantity');
    const scaledQty = parseQtyToScaled(exactQty);
    if (scaledQty <= 0n) {
      throw new Error('INVALID_QUANTITY: Reservation quantity must be greater than zero.');
    }

    return this.db.withTransaction(async (tx) => {
      // 1. Check idempotency key if provided
      if (idempotencyKey) {
        const existing = await this.reservationRepo.findByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existing) {
          const isMatch =
            existing.location_id === data.location_id &&
            existing.variant_id === data.variant_id &&
            parseQtyToScaled(existing.quantity) === scaledQty &&
            existing.reference_type === data.reference_type &&
            existing.reference_id === data.reference_id;

          if (isMatch) {
            return existing;
          }
          throw new Error(
            `IDEMPOTENCY_CONFLICT: A conflicting reservation already exists with idempotency key '${idempotencyKey}'.`
          );
        }
      }

      const useSavepoint = !!idempotencyKey;
      if (useSavepoint) {
        await tx.exec('SAVEPOINT sp_reservation_attempt');
      }

      try {
        // 2. Verify tenant ownership
        const isLocValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.location_id, tx);
        if (!isLocValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Location '${data.location_id}' does not belong to organization.`);
        }

        const isVarValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, data.variant_id, tx);
        if (!isVarValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Variant '${data.variant_id}' does not belong to organization.`);
        }

        // 3. Adjust balance reserved atomically (checks available stock via FOR UPDATE lock)
        await this.inventoryRepo.adjustReserved(
          {
            organization_id: organizationId,
            location_id: data.location_id,
            variant_id: data.variant_id,
            delta_reserved: exactQty,
          },
          tx
        );

        // 4. Create reservation record with collision-resistant UUID
        const reservationId = generateInventoryId('res');
        const reservation = await this.reservationRepo.createReservation(
          {
            id: reservationId,
            organization_id: organizationId,
            location_id: data.location_id,
            variant_id: data.variant_id,
            quantity: exactQty,
            reference_type: data.reference_type,
            reference_id: data.reference_id,
            status: 'ACTIVE',
            idempotency_key: idempotencyKey || null,
            notes: data.notes,
            expires_at: data.expires_at,
            created_by: performed_by,
          },
          tx
        );
        if (useSavepoint) {
          await tx.exec('RELEASE SAVEPOINT sp_reservation_attempt');
        }
        return reservation;
      } catch (err: any) {
        if (useSavepoint) {
          try {
            await tx.exec('ROLLBACK TO SAVEPOINT sp_reservation_attempt');
          } catch {
            // ignore savepoint rollback error
          }
        }
        // Handle race condition on unique index uq_inventory_reservations_org_idempotency
        if (idempotencyKey && (err.code === '23505' || String(err.message).includes('uq_inventory_reservations_org_idempotency'))) {
          const existing = await this.reservationRepo.findByIdempotencyKey(organizationId, idempotencyKey, tx);
          if (existing) {
            const isMatch =
              existing.location_id === data.location_id &&
              existing.variant_id === data.variant_id &&
              parseQtyToScaled(existing.quantity) === scaledQty &&
              existing.reference_type === data.reference_type &&
              existing.reference_id === data.reference_id;

            if (isMatch) {
              return existing;
            }
          }
          throw new Error(
            `IDEMPOTENCY_CONFLICT: A conflicting reservation was concurrently created with idempotency key '${idempotencyKey}'.`
          );
        }
        throw err;
      }
    });
  }

  async releaseReservation(
    organizationId: string,
    reservationId: string,
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization context is required for releaseReservation.');
    }
    return this.db.withTransaction(async (tx) => {
      const reservation = await this.reservationRepo.findById(organizationId, reservationId, tx);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
      }
      if (reservation.status === 'RELEASED') {
        // Idempotent: already released, return cleanly without duplicating inventory restoration
        return reservation;
      }
      if (reservation.status !== 'ACTIVE') {
        throw new Error(`INVALID_RESERVATION_STATE: Reservation '${reservationId}' is in state '${reservation.status}', expected 'ACTIVE'.`);
      }

      // 1. Reduce reserved count on balance
      const negQty = `-${reservation.quantity}`;
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          delta_reserved: negQty,
        },
        tx
      );

      // 2. Update reservation status
      const updated = await this.reservationRepo.updateStatus(organizationId, reservationId, 'RELEASED', tx);
      return updated!;
    });
  }

  async fulfillReservation(
    organizationId: string,
    reservationId: string,
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization context is required for fulfillReservation.');
    }
    return this.db.withTransaction(async (tx) => {
      const reservation = await this.reservationRepo.findById(organizationId, reservationId, tx);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
      }
      if (reservation.status === 'FULFILLED') {
        // Idempotent: already fulfilled, return cleanly without duplicating stock deduction
        return reservation;
      }
      if (reservation.status !== 'ACTIVE') {
        throw new Error(`INVALID_RESERVATION_STATE: Reservation '${reservationId}' is in state '${reservation.status}', expected 'ACTIVE'.`);
      }

      // 1. Decrement reserved on balance
      const negQty = `-${reservation.quantity}`;
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          delta_reserved: negQty,
        },
        tx
      );

      // 2. Decrement on_hand and record sale movement
      await this.inventoryRepo.recordMovement(
        {
          id: generateInventoryId('mov_ful'),
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          movement_type: 'POS_SALE',
          quantity_change: negQty,
          reference_type: reservation.reference_type,
          reference_id: reservation.reference_id,
          performed_by,
          reason: `Fulfilled reservation ${reservation.id}`,
        },
        tx
      );

      // 3. Mark reservation fulfilled
      const updated = await this.reservationRepo.updateStatus(organizationId, reservationId, 'FULFILLED', tx);
      return updated!;
    });
  }

  async cancelReservation(
    organizationId: string,
    reservationId: string,
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization context is required for cancelReservation.');
    }
    return this.db.withTransaction(async (tx) => {
      const reservation = await this.reservationRepo.findById(organizationId, reservationId, tx);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
      }
      if (reservation.status === 'CANCELLED') {
        // Idempotent: already cancelled
        return reservation;
      }
      if (reservation.status !== 'ACTIVE') {
        throw new Error(`INVALID_RESERVATION_STATE: Reservation '${reservationId}' is in state '${reservation.status}', expected 'ACTIVE'.`);
      }

      // 1. Release reserved stock
      const negQty = `-${reservation.quantity}`;
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          delta_reserved: negQty,
        },
        tx
      );

      // 2. Mark reservation cancelled
      const updated = await this.reservationRepo.updateStatus(organizationId, reservationId, 'CANCELLED', tx);
      return updated!;
    });
  }

  /**
   * Scans for active reservations past their expiration timestamp and releases their reserved stock.
   */
  async expireStaleReservations(organizationId?: string): Promise<{ expiredCount: number; reservationIds: string[] }> {
    const expiredList = await this.reservationRepo.findExpiredReservations(organizationId);
    const expiredIds: string[] = [];

    for (const res of expiredList) {
      try {
        await this.db.withTransaction(async (tx) => {
          // Re-fetch under lock / transaction
          const current = await this.reservationRepo.findById(res.organization_id, res.id, tx);
          if (current && current.status === 'ACTIVE') {
            await this.inventoryRepo.adjustReserved(
              {
                organization_id: current.organization_id,
                location_id: current.location_id,
                variant_id: current.variant_id,
                delta_reserved: `-${current.quantity}`,
              },
              tx
            );
            await this.reservationRepo.updateStatus(current.organization_id, current.id, 'EXPIRED', tx);
            expiredIds.push(current.id);
          }
        });
      } catch (err) {
        // Continue processing remaining expired records even if one fails
        console.error(`Failed to expire reservation ${res.id}:`, err);
      }
    }

    return { expiredCount: expiredIds.length, reservationIds: expiredIds };
  }

  async getReservation(
    organizationId: string,
    reservationId: string
  ): Promise<InventoryReservationRecord | null> {
    return this.reservationRepo.findById(organizationId, reservationId);
  }

  async listReservations(
    organizationId: string,
    options: {
      locationId?: string;
      variantId?: string;
      referenceType?: string;
      referenceId?: string;
      status?: ReservationStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<InventoryReservationRecord[]> {
    return this.reservationRepo.listReservations({
      organizationId,
      ...options,
    });
  }
}
