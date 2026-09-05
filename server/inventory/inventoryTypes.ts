/**
 * Authoritative Inventory Domain Types (INV-001)
 * 
 * Server-authoritative data models, DTOs, and status enums.
 * Balances are a transactional projection of an immutable inventory movement ledger.
 */

export interface InventoryBalanceRecord {
  id: string;
  organization_id: string;
  location_id: string;
  variant_id: string;
  on_hand: number;
  reserved: number;
  damaged: number;
  expired: number;
  in_transit: number;
  available: number;
  created_at?: string;
  updated_at?: string;
}

export type MovementType =
  | 'OPENING_BALANCE'
  | 'PURCHASE_RECEIVE'
  | 'POS_SALE'
  | 'ECOMMERCE_SALE'
  | 'WHOLESALE_SALE'
  | 'SALE_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_DAMAGE'
  | 'ADJUSTMENT_EXPIRED'
  | 'ADJUSTMENT_STOCKTAKE'
  | 'ADJUSTMENT_CORRECTION'
  | 'DAMAGE_WRITE_OFF'
  | 'EXPIRY_WRITE_OFF'
  | 'INVENTORY_COUNT';

export interface InventoryMovementRecord {
  id: string;
  organization_id: string;
  location_id: string;
  variant_id: string;
  movement_type: MovementType;
  quantity_change: number;
  previous_balance: number;
  new_balance: number;
  unit_cost: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  performed_by: string;
  notes?: string | null;
  source_location_id?: string | null;
  destination_location_id?: string | null;
  idempotency_key?: string | null;
  source_system?: string | null;
  source_reference?: string | null;
  created_at?: string;
}

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';

export interface InventoryReservationRecord {
  id: string;
  organization_id: string;
  location_id: string;
  variant_id: string;
  quantity: number;
  reference_type: string;
  reference_id: string;
  status: ReservationStatus;
  notes?: string | null;
  expires_at?: string | null;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export type TransferStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'VARIANCE';

export interface InventoryTransferRecord {
  id: string;
  organization_id: string;
  transfer_number: string;
  source_location_id: string;
  destination_location_id: string;
  status: TransferStatus;
  requested_by: string;
  approved_by?: string | null;
  dispatched_by?: string | null;
  received_by?: string | null;
  requested_at?: string;
  approved_at?: string | null;
  dispatched_at?: string | null;
  received_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  items?: InventoryTransferItemRecord[];
  created_at?: string;
  updated_at?: string;
}

export interface InventoryTransferItemRecord {
  id: string;
  transfer_id: string;
  variant_id: string;
  requested_quantity: number;
  approved_quantity: number;
  dispatched_quantity: number;
  received_quantity: number;
  variance_quantity: number;
  notes?: string | null;
  created_at?: string;
}

export type StockCountStatus = 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'CANCELLED';

export interface StockCountRecord {
  id: string;
  organization_id: string;
  location_id: string;
  count_number: string;
  status: StockCountStatus;
  created_by: string;
  submitted_by?: string | null;
  approved_by?: string | null;
  notes?: string | null;
  items?: StockCountItemRecord[];
  created_at?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  updated_at?: string;
}

export interface StockCountItemRecord {
  id: string;
  stock_count_id: string;
  variant_id: string;
  system_quantity: number;
  counted_quantity: number;
  variance_quantity: number;
  notes?: string | null;
  created_at?: string;
}
