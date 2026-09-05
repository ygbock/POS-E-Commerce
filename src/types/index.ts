export type Role =
  | 'Super Admin'
  | 'Business Owner'
  | 'Inventory Manager'
  | 'Warehouse Manager'
  | 'Cashier'
  | 'Store Manager'
  | 'Accountant'
  | 'E-commerce Customer';

export type BranchLocationId = 'loc-main-wh' | 'loc-store-downtown' | 'loc-branch-north' | 'loc-dist-center';

export interface BranchLocation {
  id: BranchLocationId;
  name: string;
  type: 'Warehouse' | 'Retail Store' | 'Distribution Center';
  address: string;
  phone: string;
  manager: string;
  isPosEnabled: boolean;
}

export type CustomerTier = 'Bronze' | 'Silver' | 'Gold' | 'VIP';
export type StockAdjustmentReason = 'Damage' | 'Expired' | 'Found' | 'Shrinkage / Theft' | 'Count Correction';

export type ProductType = 'standard' | 'variant' | 'bundle' | 'composite';
export type ProductStatus = 'active' | 'inactive' | 'discontinued';

export interface Category {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  description?: string;
  iconName?: string;
  accentColor?: string;
  subcategories: string[];
  displayOrder: number;
  isPosQuickAccess?: boolean;
}

export interface Brand {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  logoUrl?: string;
  countryOfOrigin?: string;
  website?: string;
  description?: string;
  isActive: boolean;
}

export interface UnitOfMeasurement {
  id: string;
  code: string; // e.g. 'pcs', 'kg', 'box', 'carton'
  name: string; // e.g. 'Pieces', 'Kilogram', 'Standard Box'
  category: 'Count' | 'Weight' | 'Volume' | 'Length' | 'Packaging';
  allowFractional: boolean;
  baseUnitCode?: string;
  conversionFactor?: number; // e.g. 1 box = 12 pcs -> factor 12
}

export interface BundleItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface CompositeBomItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantityRequired: number;
  unitCost: number;
  scrapPercentage?: number; // e.g. 2% scrap allowance
}

export type SerialStatus = 'In Stock' | 'Allocated' | 'Sold' | 'Under Repair' | 'Defective' | 'Returned';

export interface SerialNumberRecord {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  locationId: BranchLocationId;
  locationName: string;
  status: SerialStatus;
  receivedDate: string;
  warrantyExpiry?: string;
  orderId?: string;
  orderNumber?: string;
  purchaseOrderId?: string;
  notes?: string;
}

export interface BatchLotRecord {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  locationId: BranchLocationId;
  locationName: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  manufactureDate?: string;
  expiryDate: string;
  supplierName?: string;
  notes?: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode: string;
  qrCode?: string;
  name: string; // e.g. "Black / Large" or "500g"
  attributes: { [key: string]: string }; // { Color: "Black", Size: "L", Model: "Pro", Weight: "500g" }
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  memberPrice: number;
  minSellingPrice: number;
  weightKg?: number;
  dimensionsCm?: { length: number; width: number; height: number };
  unit?: string;
  stockByLocation: { [locationId in BranchLocationId]?: number };
  lowStockThreshold: number;
  image?: string;
}

export interface ProductReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
}

export interface ProductSpecification {
  group?: string;
  name: string;
  value: string;
}

export interface CatalogAttribute {
  id: string;
  organizationId?: string;
  name: string; // e.g. 'Color', 'Size', 'Material', 'Storage', 'Weight'
  code: string; // e.g. 'color', 'size'
  type: 'select' | 'text' | 'number' | 'boolean';
  options: string[]; // e.g. ['Midnight Black', 'Silver Cloud', 'Space Gray']
  required?: boolean;
  description?: string;
  usageCount?: number;
}

export interface Product {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  shortDescription: string;
  unit: string; // 'pcs', 'kg', 'box', 'set'
  productType?: ProductType;
  status: ProductStatus;
  channels?: {
    pos: boolean;
    ecommerce: boolean;
    wholesale: boolean;
  };
  isBundle?: boolean;
  bundleItems?: BundleItem[];
  isComposite?: boolean;
  bomItems?: CompositeBomItem[];
  assemblyLaborCost?: number;
  isTrackSerial?: boolean;
  isTrackBatch?: boolean;
  taxRate: number; // percentage, e.g. 10 for 10%
  rating: number;
  reviewCount: number;
  tags: string[];
  images: string[];
  variants: ProductVariant[];
  featured?: boolean;
  compareAtPrice?: number;
  salesCount?: number;
  specifications?: ProductSpecification[];
  reviewsList?: ProductReview[];
  createdAt: string;
  updatedAt?: string;
}

export type StockMovementType =
  | 'PURCHASE_RECEIVE'
  | 'POS_SALE'
  | 'ECOMMERCE_SALE'
  | 'SALE_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_DAMAGE'
  | 'ADJUSTMENT_EXPIRED'
  | 'ADJUSTMENT_STOCKTAKE'
  | 'ADJUSTMENT_CORRECTION';

export interface StockMovement {
  id: string;
  timestamp: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  locationId: BranchLocationId;
  locationName: string;
  type: StockMovementType;
  quantityChange: number; // e.g. -2 or +10
  previousStock: number;
  newStock: number;
  referenceId?: string; // Order #, PO #, Transfer #
  reason?: string;
  performedBy: string;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  sourceLocationId: BranchLocationId;
  sourceLocationName: string;
  destLocationId: BranchLocationId;
  destLocationName: string;
  status: 'Draft' | 'Requested' | 'Approved' | 'In Transit' | 'Received' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    requestedQty: number;
    dispatchedQty?: number;
    receivedQty?: number;
    variance?: number;
  }[];
  notes?: string;
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  locationId: BranchLocationId;
  locationName: string;
  createdAt: string;
  status: 'Draft' | 'Approved' | 'Rejected';
  approvedBy?: string;
  reason: 'Damage' | 'Expired' | 'Found' | 'Shrinkage / Theft' | 'Count Correction';
  items: {
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    systemStock: number;
    physicalCount: number;
    variance: number;
    unitCost: number;
    totalVarianceValue: number;
  }[];
  notes?: string;
}

export interface WarehouseBin {
  id: string;
  warehouseId: BranchLocationId;
  zone: string; // e.g. "Zone A"
  aisle: string; // e.g. "Aisle 02"
  rack: string; // e.g. "Rack 04"
  shelf: string; // e.g. "Shelf 03"
  binCode: string; // e.g. "WH-A-02-04-03-B12"
  maxCapacity: number;
  currentItems: {
    productId: string;
    variantId: string;
    productName: string;
    sku: string;
    quantity: number;
    batchNumber?: string;
    expiryDate?: string;
  }[];
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string; // e.g. 'Net 30'
  rating: number;
  leadTimeDays: number;
  activeOrdersCount: number;
}

export interface PurchaseOrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  destinationLocationId: BranchLocationId;
  destinationLocationName: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Partially Received' | 'Received' | 'Cancelled';
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid';
  orderDate: string;
  expectedDate: string;
  receivedDate?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  totalAmount: number;
  notes?: string;
  createdBy: string;
}

export type PaymentMethod = 'Cash' | 'Credit Card' | 'Mobile Money' | 'Store Credit' | 'Bank Transfer' | 'Fintech Wallet';

export interface PaymentRecord {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  timestamp: string;
}

export interface CartItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  price: number;
  originalPrice?: number;
  minSellingPrice?: number;
  costPrice: number;
  quantity: number;
  discountPercentage?: number;
  taxRate: number;
  image?: string;
  unit: string;
  overrideApproved?: boolean;
  overrideApprovedBy?: string;
  overrideReason?: string;
}

export type OrderSource = 'POS' | 'ECOMMERCE' | 'PHONE' | 'WHOLESALE';
export type OrderStatus =
  | 'Pending'
  | 'Stock Reserved'
  | 'Payment Confirmed'
  | 'Picking'
  | 'Packed'
  | 'Dispatched'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled'
  | 'Refunded';

export interface Order {
  id: string;
  orderNumber: string;
  source: OrderSource;
  channel: string; // "Downtown POS Terminal 1" or "Online Web Store"
  locationId: BranchLocationId;
  locationName: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerTier?: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  fulfillmentMethod: 'In-Store Pickup' | 'Standard Delivery' | 'Express Delivery' | 'POS Walk-in';
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  taxAmount: number;
  shippingFee: number;
  totalAmount: number;
  totalCostAmount: number;
  payments: PaymentRecord[];
  paymentStatus: 'Pending' | 'Paid' | 'Partially Refunded' | 'Refunded';
  status: OrderStatus;
  cashierName?: string;
  trackingNumber?: string;
  carrierName?: string;
  trackingMagicToken?: string;
  smsOptIn?: boolean;
  whatsappOptIn?: boolean;
  smsUpdatesLog?: { timestamp: string; channel: 'SMS' | 'WhatsApp'; message: string; status: 'Sent' | 'Delivered' }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  loyaltyPoints: number;
  storeCreditBalance: number;
  creditLimit: number;
  totalSpent: number;
  ordersCount: number;
  addresses: {
    id: string;
    label: string;
    street: string;
    city: string;
    zip: string;
    isDefault: boolean;
  }[];
  notes?: string;
  customerGroup: 'Retail' | 'Wholesale' | 'Corporate' | 'VIP Member';
  registeredAt: string;
}

export interface CashDenominations {
  hundreds: number;
  fifties: number;
  twenties: number;
  tens: number;
  fives: number;
  ones: number;
  coins: number;
}

export interface CashMovement {
  id: string;
  type: 'Cash In' | 'Cash Out';
  amount: number;
  reason: string;
  cashierName: string;
  performedAt: string;
  approvedBy?: string;
}

export interface PosShiftReconciliation {
  primaryCount: number;
  secondCount: number;
  isDoubleChecked: boolean;
  verifierName?: string;
  variance: number;
  varianceReason?: 'Balanced' | 'Change Dispense Error' | 'Unrecorded Petty Expense' | 'Drawer Float Mismatch' | 'Counterfeit Bill' | 'Bank Deposit Transfer' | 'Other';
  denominations?: CashDenominations;
  supervisorApproved: boolean;
  supervisorName?: string;
  ledgerEntryId?: string;
  reconciledAt: string;
}

export interface PosShift {
  id: string;
  terminalId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCashCalculated: number;
  closingCashActual?: number;
  cashDifference?: number;
  totalSales: number;
  totalCashSales: number;
  totalCardSales: number;
  totalMobileSales: number;
  totalWalletSales: number;
  totalRefunds: number;
  cashInTotal?: number;
  cashOutTotal?: number;
  cashMovements?: CashMovement[];
  transactionsCount: number;
  status: 'Open' | 'Closed';
  notes?: string;
  reconciliation?: PosShiftReconciliation;
}

export interface HeldCart {
  id: string;
  cartId: string;
  customerId?: string;
  customerName: string;
  items: CartItem[];
  heldAt: string;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  transactionNumber: string;
  source: 'POS_SALE' | 'ECOMMERCE_SALE' | 'PO_PAYMENT' | 'INVENTORY_ADJUSTMENT' | 'SALE_REFUND' | 'POS_SHIFT_RECONCILIATION' | 'POS_CASH_MOVEMENT';
  description: string;
  referenceId: string; // Order # or PO #
  accountDebited: string;
  accountCredited: string;
  amount: number;
}

export type AuditModule =
  | 'Products'
  | 'Inventory'
  | 'POS'
  | 'Orders'
  | 'Purchasing'
  | 'CRM'
  | 'Finance'
  | 'Settings'
  | 'Security'
  | 'Pricing';

export type AuditSeverity = 'Info' | 'Low' | 'Medium' | 'High' | 'Critical';

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  role: Role;
  action: string;
  module: AuditModule;
  targetId: string;
  beforeValue?: string;
  afterValue?: string;
  ipAddress?: string;
  severity?: AuditSeverity;
  locationName?: string;
}

export interface RolePermission {
  role: Role;
  canOverridePrice: boolean;
  canApproveStockAdjustments: boolean;
  canProcessReturns: boolean;
  canDeleteProducts: boolean;
  canViewFinancialLedger: boolean;
  canManageUsers: boolean;
}

export interface SystemNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'success' | 'danger';
  isRead: boolean;
  linkTab?: string;
}

export interface CouponCode {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  value: number;
  minOrderAmount: number;
  usageLimit: number;
  usageCount: number;
  expiresAt: string;
  isActive: boolean;
  applicableCategory?: string;
}

export interface Currency {
  code: string;        // e.g. 'SLE', 'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'CAD', 'CNY', 'JPY'
  symbol: string;      // e.g. 'Le', '$', '€', '£', '₦', '₵', 'CA$', '¥', '¥'
  name: string;        // e.g. 'Sierra Leonean Leone'
  rate: number;        // Exchange rate relative to base unit
  flag: string;        // Emoji flag
}

export const DEFAULT_CURRENCY_CODE = 'SLE';

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'SLE', symbol: 'Le', name: 'Sierra Leonean Leone', rate: 22.50, flag: '🇸🇱' },
  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1.00, flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.92, flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', rate: 0.78, flag: '🇬🇧' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', rate: 1520.00, flag: '🇳🇬' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi', rate: 15.40, flag: '🇬🇭' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', rate: 1.36, flag: '🇨🇦' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', rate: 7.23, flag: '🇨🇳' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rate: 155.00, flag: '🇯🇵' },
];

