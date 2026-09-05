import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryReservationRepository } from '../repositories/inventoryReservationRepository';
import { InventoryReservationRecord, ReservationStatus } from './inventoryTypes';
import { roundQty } from './inventoryPolicies';

/**
 * Inventory Reservation Service (INV-001)
 * 
 * Coordinates first-class inventory reservations:
 * - Creates active reservations with atomic balance reserved updates.
 * - Releases reservations, restoring available stock.
 * - Fulfills reservations on order completion.
 * - Cancels expired or abandoned reservations.
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
      quantity: number;
      reference_type: string;
      reference_id: string;
      notes?: string;
      expires_at?: string;
    },
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    if (data.quantity <= 0) {
      throw new Error('INVALID_QUANTITY: Reservation quantity must be greater than zero.');
    }

    const roundedQty = roundQty(data.quantity);
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return this.db.withTransaction(async (tx) => {
      // 1. Verify tenant ownership
      const isLocValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.location_id, tx);
      if (!isLocValid) {
        throw new Error(`TENANT_ACCESS_DENIED: Location '${data.location_id}' does not belong to organization.`);
      }

      const isVarValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, data.variant_id, tx);
      if (!isVarValid) {
        throw new Error(`TENANT_ACCESS_DENIED: Variant '${data.variant_id}' does not belong to organization.`);
      }

      // 2. Adjust balance reserved atomically (checks available stock)
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: data.location_id,
          variant_id: data.variant_id,
          delta_reserved: roundedQty,
        },
        tx
      );

      // 3. Create reservation record
      return this.reservationRepo.createReservation(
        {
          id: reservationId,
          organization_id: organizationId,
          location_id: data.location_id,
          variant_id: data.variant_id,
          quantity: roundedQty,
          reference_type: data.reference_type,
          reference_id: data.reference_id,
          status: 'ACTIVE',
          notes: data.notes,
          expires_at: data.expires_at,
          created_by: performed_by,
        },
        tx
      );
    });
  }

  async releaseReservation(
    organizationId: string,
    reservationId: string,
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    return this.db.withTransaction(async (tx) => {
      const reservation = await this.reservationRepo.findById(reservationId, organizationId, tx);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
      }
      if (reservation.status !== 'ACTIVE') {
        throw new Error(`INVALID_RESERVATION_STATE: Reservation '${reservationId}' is in state '${reservation.status}', expected 'ACTIVE'.`);
      }

      // 1. Reduce reserved count on balance
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          delta_reserved: -reservation.quantity,
        },
        tx
      );

      // 2. Update reservation status
      const updated = await this.reservationRepo.updateStatus(reservationId, 'RELEASED', organizationId, tx);
      return updated!;
    });
  }

  async fulfillReservation(
    organizationId: string,
    reservationId: string,
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    return this.db.withTransaction(async (tx) => {
      const reservation = await this.reservationRepo.findById(reservationId, organizationId, tx);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
      }
      if (reservation.status !== 'ACTIVE') {
        throw new Error(`INVALID_RESERVATION_STATE: Reservation '${reservationId}' is in state '${reservation.status}', expected 'ACTIVE'.`);
      }

      // 1. Decrement reserved on balance
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          delta_reserved: -reservation.quantity,
        },
        tx
      );

      // 2. Decrement on_hand and record sale movement
      await this.inventoryRepo.recordMovement(
        {
          id: `mov_ful_${reservation.id}_${Date.now()}`,
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          movement_type: 'POS_SALE',
          quantity_change: -reservation.quantity,
          reference_type: reservation.reference_type,
          reference_id: reservation.reference_id,
          performed_by,
          reason: `Fulfilled reservation ${reservation.id}`,
        },
        tx
      );

      // 3. Mark reservation fulfilled
      const updated = await this.reservationRepo.updateStatus(reservationId, 'FULFILLED', organizationId, tx);
      return updated!;
    });
  }

  async cancelReservation(
    organizationId: string,
    reservationId: string,
    performed_by: string
  ): Promise<InventoryReservationRecord> {
    return this.db.withTransaction(async (tx) => {
      const reservation = await this.reservationRepo.findById(reservationId, organizationId, tx);
      if (!reservation) {
        throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
      }
      if (reservation.status !== 'ACTIVE') {
        throw new Error(`INVALID_RESERVATION_STATE: Reservation '${reservationId}' is in state '${reservation.status}', expected 'ACTIVE'.`);
      }

      // 1. Release reserved stock
      await this.inventoryRepo.adjustReserved(
        {
          organization_id: organizationId,
          location_id: reservation.location_id,
          variant_id: reservation.variant_id,
          delta_reserved: -reservation.quantity,
        },
        tx
      );

      // 2. Mark reservation cancelled
      const updated = await this.reservationRepo.updateStatus(reservationId, 'CANCELLED', organizationId, tx);
      return updated!;
    });
  }

  async getReservation(
    organizationId: string,
    reservationId: string
  ): Promise<InventoryReservationRecord | null> {
    return this.reservationRepo.findById(reservationId, organizationId);
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
