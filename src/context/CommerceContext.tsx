import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  BranchLocation,
  BranchLocationId,
  Product,
  ProductVariant,
  Category,
  Brand,
  UnitOfMeasurement,
  SerialNumberRecord,
  BatchLotRecord,
  StockMovement,
  StockTransfer,
  StockAdjustment,
  Supplier,
  PurchaseOrder,
  Order,
  Customer,
  PosShift,
  PosShiftReconciliation,
  CashDenominations,
  CashMovement,
  HeldCart,
  LedgerEntry,
  AuditLog,
  WarehouseBin,
  CouponCode,
  SystemNotification,
  Role,
  CartItem,
  PaymentRecord,
  OrderStatus,
  ProductReview,
  ProductSpecification,
  Currency,
  DEFAULT_CURRENCY_CODE,
  SUPPORTED_CURRENCIES,
} from '../types';
import {
  INITIAL_LOCATIONS,
  INITIAL_PRODUCTS,
  INITIAL_CATEGORIES,
  INITIAL_BRANDS,
  INITIAL_UNITS,
  INITIAL_SERIAL_NUMBERS,
  INITIAL_BATCH_LOTS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_TRANSFERS,
  INITIAL_SUPPLIERS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
  INITIAL_LEDGER_ENTRIES,
  INITIAL_POS_SHIFT,
  INITIAL_POS_SHIFT_HISTORY,
  INITIAL_WAREHOUSE_BINS,
  INITIAL_COUPONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
} from '../data/initialData';

interface CommerceContextType {
  // Navigation & Personas
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  currentLocationId: BranchLocationId;
  setCurrentLocationId: (id: BranchLocationId) => void;
  currentLocation: BranchLocation;
  locations: BranchLocation[];

  // Products & Master Catalog
  products: Product[];
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  duplicateProduct: (productId: string) => Product | undefined;
  getProductById: (productId: string) => Product | undefined;
  getVariantById: (productId: string, variantId: string) => ProductVariant | undefined;
  generateSku: (brand: string, category: string, name: string, attributes?: { [k: string]: string }) => string;
  generateBarcode: (prefix?: string) => string;
  calculateBomAvailability: (product: Product, locationId?: BranchLocationId) => number;

  // Categories & Subcategories
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  addCategory: (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  deleteCategory: (catId: string) => void;

  // Brands
  brands: Brand[];
  setBrands: React.Dispatch<React.SetStateAction<Brand[]>>;
  addBrand: (brand: Brand) => void;
  updateBrand: (brand: Brand) => void;
  deleteBrand: (brandId: string) => void;

  // Units of Measurement
  unitsOfMeasurement: UnitOfMeasurement[];
  setUnitsOfMeasurement: React.Dispatch<React.SetStateAction<UnitOfMeasurement[]>>;
  addUnit: (unit: UnitOfMeasurement) => void;
  updateUnit: (unit: UnitOfMeasurement) => void;
  deleteUnit: (unitId: string) => void;

  // Serial Numbers Registry
  serialNumbers: SerialNumberRecord[];
  setSerialNumbers: React.Dispatch<React.SetStateAction<SerialNumberRecord[]>>;
  addSerialNumber: (sn: SerialNumberRecord) => void;
  updateSerialNumberStatus: (id: string, status: SerialNumberRecord['status'], notes?: string) => void;

  // Batches & Lot Numbers with Expiry Tracking
  batchLots: BatchLotRecord[];
  setBatchLots: React.Dispatch<React.SetStateAction<BatchLotRecord[]>>;
  addBatchLot: (lot: BatchLotRecord) => void;
  updateBatchLot: (lot: BatchLotRecord) => void;
  deleteBatchLot: (lotId: string) => void;
  disposeExpiredBatch: (lotId: string, notes?: string) => void;

  // Inventory & Stock
  stockMovements: StockMovement[];
  transfers: StockTransfer[];
  stockTransfers: StockTransfer[];
  adjustments: StockAdjustment[];
  createStockAdjustment: (adj: Omit<StockAdjustment, 'id' | 'adjustmentNumber' | 'createdAt'>) => void;
  createStockTransfer: (transfer: Omit<StockTransfer, 'id' | 'transferNumber' | 'createdAt' | 'updatedAt' | 'status'>) => void;
  updateTransferStatus: (transferId: string, status: StockTransfer['status'], receivedQtys?: { [sku: string]: number }) => void;
  receiveStockTransfer: (transferId: string) => void;
  getTotalStockForVariant: (variant: ProductVariant) => number;
  getLocationStockForVariant: (variant: ProductVariant, locId: BranchLocationId) => number;

  // Purchasing & Suppliers
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (supplier: Supplier) => void;
  deleteSupplier: (supplierId: string) => void;
  createPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'orderDate'>) => void;
  updatePurchaseOrderStatus: (poId: string, status: PurchaseOrder['status']) => void;
  receivePurchaseOrderGoods: (poId: string, receivedItems: { variantId: string; quantity: number; batchNumber?: string; expiryDate?: string }[]) => void;

  // POS Module
  posShift: PosShift;
  posShiftHistory: PosShift[];
  posCart: CartItem[];
  selectedPosCustomer: Customer | null;
  heldCarts: HeldCart[];
  addToPosCart: (product: Product, variant: ProductVariant, quantity?: number) => void;
  updatePosCartItemQty: (variantId: string, qty: number) => void;
  updatePosCartItemDiscount: (variantId: string, discountPct: number) => void;
  updatePosCartItemPriceAndDiscount: (
    variantId: string,
    newPrice: number,
    discountPct: number,
    overrideInfo?: { approvedBy: string; reason: string }
  ) => void;
  removeFromPosCart: (variantId: string) => void;
  clearPosCart: () => void;
  setSelectedPosCustomer: (customer: Customer | null) => void;
  holdCurrentPosCart: (note?: string) => void;
  resumeHeldPosCart: (heldId: string) => void;
  removeHeldPosCart: (heldId: string) => void;
  processPosCheckout: (payments: PaymentRecord[], discountCode?: string) => Order;
  processPosReturn: (orderId: string, returnItems: { variantId: string; quantity: number; reason: string; restock: boolean }[], refundAmount: number) => void;
  openPosShift: (openingCash: number, cashierName: string) => void;
  addPosCashMovement: (type: 'Cash In' | 'Cash Out', amount: number, reason: string, approvedBy?: string) => void;
  closePosShift: (
    actualCash: number,
    closeOptions?: {
      secondCount?: number;
      verifierName?: string;
      varianceReason?: PosShiftReconciliation['varianceReason'];
      denominations?: CashDenominations;
      supervisorApproved?: boolean;
      supervisorName?: string;
      notes?: string;
    }
  ) => void;

  // E-Commerce Storefront
  storeCart: CartItem[];
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  activeCustomerUser: Customer | null;
  setActiveCustomerUser: (customer: Customer | null) => void;
  addProductReview: (productId: string, review: Omit<ProductReview, 'id' | 'date' | 'helpfulCount'>) => void;
  appliedCoupon: CouponCode | null;
  addToStoreCart: (product: Product, variant: ProductVariant, quantity?: number) => void;
  updateStoreCartQty: (variantId: string, qty: number) => void;
  removeFromStoreCart: (variantId: string) => void;
  clearStoreCart: () => void;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  placeEcommerceOrder: (orderData: {
    customer: { name: string; email: string; phone: string; address: { street: string; city: string; state: string; zip: string; country: string } };
    fulfillmentMethod: 'Standard Delivery' | 'Express Delivery' | 'In-Store Pickup';
    paymentMethod: 'Credit Card' | 'Mobile Money' | 'Fintech Wallet';
    smsOptIn?: boolean;
    whatsappOptIn?: boolean;
  }) => Order;
  claimGuestOrders: (email: string, targetCustomerId?: string) => { claimedCount: number; pointsAdded: number; totalSpentAdded: number; claimedOrders: Order[] };
  registerNewCustomer: (customerData: { name: string; email: string; phone: string; street?: string; city?: string; state?: string; zip?: string; country?: string }) => { customer: Customer; claimedOrdersCount: number; pointsAdded: number };
  simulateAdvanceOrderStatus: (orderId: string) => Order | undefined;
  sendCustomerAlert: (orderId: string, channel: 'SMS' | 'WhatsApp', message: string) => void;

  // Unified Orders & Fulfillment
  orders: Order[];
  updateOrderStatus: (orderId: string, status: OrderStatus, trackingNumber?: string) => void;

  // CRM & Customers
  customers: Customer[];
  addCustomer: (customer: Customer) => void;
  updateCustomer: (customer: Customer) => void;
  adjustCustomerCredit: (customerId: string, amount: number, note?: string) => void;
  adjustCustomerLoyalty: (customerId: string, points: number, note?: string) => void;

  // Warehouse & Bins
  warehouseBins: WarehouseBin[];
  updateBinItemAllocation: (binId: string, variantId: string, deltaQty: number) => void;

  // Finance & Ledger
  ledgerEntries: LedgerEntry[];
  coupons: CouponCode[];
  addCoupon: (coupon: CouponCode) => void;

  // Audit Logs & Notifications
  auditLogs: AuditLog[];
  notifications: SystemNotification[];
  markNotificationAsRead: (id: string) => void;
  clearAllNotifications: () => void;
  logAuditAction: (action: string, module: AuditLog['module'], targetId: string, before?: string, after?: string) => void;

  // Global Helpers, Currency & Theme
  theme: 'light' | 'dark';
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  currencyCode: string;
  setCurrencyCode: (code: string) => void;
  currencySymbol: string;
  setCurrencySymbol: (sym: string) => void;
  currentCurrency: Currency;
  supportedCurrencies: Currency[];
  convertCurrency: (amount: number, targetCode?: string) => number;
  formatCurrency: (amount: number, targetCode?: string) => string;
  refreshExchangeRates: () => Promise<void>;
  isRatesLoading: boolean;
  lastRatesUpdate: string | null;
  resetToDefaultData: () => void;
}

const STORAGE_KEY = 'omnicore_commerce_db_v1';

const CommerceContext = createContext<CommerceContextType | undefined>(undefined);

export const CommerceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load saved state or use initial data
  const loadStored = <T,>(key: string, fallback: T): T => {
    try {
      const item = localStorage.getItem(`${STORAGE_KEY}_${key}`);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  };

  const [currentRole, setCurrentRole] = useState<Role>(() => loadStored('role', 'Super Admin'));
  const [currentLocationId, setCurrentLocationId] = useState<BranchLocationId>(() => loadStored('locationId', 'loc-store-downtown'));
  
  // Currency & Exchange Rate State (Default to SLE - Sierra Leonean Leone)
  const [currencyCode, setCurrencyCodeState] = useState<string>(() => loadStored('currencyCode', DEFAULT_CURRENCY_CODE));
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(() => {
    return loadStored('exchangeRates', {
      SLE: 22.50,
      USD: 1.00,
      EUR: 0.92,
      GBP: 0.78,
      NGN: 1520.00,
      GHS: 15.40,
      CAD: 1.36,
      CNY: 7.23,
      JPY: 155.00,
    });
  });
  const [isRatesLoading, setIsRatesLoading] = useState(false);
  const [lastRatesUpdate, setLastRatesUpdate] = useState<string | null>(() => loadStored('lastRatesUpdate', null));

  const supportedCurrencies: Currency[] = SUPPORTED_CURRENCIES.map((c) => ({
    ...c,
    rate: exchangeRates[c.code] ?? c.rate,
  }));

  const currentCurrency = supportedCurrencies.find((c) => c.code === currencyCode) || supportedCurrencies[0];
  const currencySymbol = currentCurrency.symbol;

  const setCurrencyCode = (code: string) => {
    setCurrencyCodeState(code);
    try {
      localStorage.setItem(`${STORAGE_KEY}_currencyCode`, JSON.stringify(code));
      localStorage.setItem(`${STORAGE_KEY}_currencySymbol`, JSON.stringify(code === 'SLE' ? 'Le' : (supportedCurrencies.find(c => c.code === code)?.symbol || '$')));
    } catch {
      // ignore
    }
  };

  const setCurrencySymbol = (sym: string) => {
    const found = supportedCurrencies.find((c) => c.symbol === sym || c.code === sym);
    if (found) {
      setCurrencyCode(found.code);
    }
  };

  const refreshExchangeRates = async () => {
    setIsRatesLoading(true);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          const sleRate = data.rates.SLE || (data.rates.SLL ? data.rates.SLL / 1000 : 22.50);
          const updatedRates = {
            SLE: sleRate || 22.50,
            USD: 1.00,
            EUR: data.rates.EUR || 0.92,
            GBP: data.rates.GBP || 0.78,
            NGN: data.rates.NGN || 1520.00,
            GHS: data.rates.GHS || 15.40,
            CAD: data.rates.CAD || 1.36,
            CNY: data.rates.CNY || 7.23,
            JPY: data.rates.JPY || 155.00,
          };
          setExchangeRates(updatedRates);
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setLastRatesUpdate(timeStr);
          localStorage.setItem(`${STORAGE_KEY}_exchangeRates`, JSON.stringify(updatedRates));
          localStorage.setItem(`${STORAGE_KEY}_lastRatesUpdate`, JSON.stringify(timeStr));
        }
      }
    } catch (e) {
      console.warn('FX Rate update failed, using cached/default rates', e);
    } finally {
      setIsRatesLoading(false);
    }
  };

  // Attempt live rates refresh on load
  useEffect(() => {
    refreshExchangeRates();
  }, []);

  // Global Theme Mode (light / dark)
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => loadStored<'light' | 'dark'>('theme', 'light'));
  const isDarkMode = theme === 'dark';

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(`${STORAGE_KEY}_theme`, JSON.stringify(theme));
    } catch {
      // ignore
    }
  }, [theme]);

  const [locations] = useState<BranchLocation[]>(INITIAL_LOCATIONS);
  const [categories, setCategories] = useState<Category[]>(() => loadStored('categories', INITIAL_CATEGORIES));
  const [brands, setBrands] = useState<Brand[]>(() => loadStored('brands', INITIAL_BRANDS));
  const [unitsOfMeasurement, setUnitsOfMeasurement] = useState<UnitOfMeasurement[]>(() => loadStored('units', INITIAL_UNITS));
  const [serialNumbers, setSerialNumbers] = useState<SerialNumberRecord[]>(() => loadStored('serials', INITIAL_SERIAL_NUMBERS));
  const [batchLots, setBatchLots] = useState<BatchLotRecord[]>(() => loadStored('batches', INITIAL_BATCH_LOTS));
  const [products, setProducts] = useState<Product[]>(() => loadStored('products', INITIAL_PRODUCTS));
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => loadStored('stockMovements', INITIAL_STOCK_MOVEMENTS));
  const [transfers, setTransfers] = useState<StockTransfer[]>(() => loadStored('transfers', INITIAL_TRANSFERS));
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(() => loadStored('adjustments', []));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadStored('suppliers', INITIAL_SUPPLIERS));
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => loadStored('purchaseOrders', INITIAL_PURCHASE_ORDERS));
  const [orders, setOrders] = useState<Order[]>(() => loadStored('orders', INITIAL_ORDERS));
  const [customers, setCustomers] = useState<Customer[]>(() => loadStored('customers', INITIAL_CUSTOMERS));
  const [posShift, setPosShift] = useState<PosShift>(() => loadStored('posShift', INITIAL_POS_SHIFT));
  const [posShiftHistory, setPosShiftHistory] = useState<PosShift[]>(() => loadStored('posShiftHistory', INITIAL_POS_SHIFT_HISTORY));
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>(() => loadStored('heldCarts', []));
  const [warehouseBins, setWarehouseBins] = useState<WarehouseBin[]>(() => loadStored('warehouseBins', INITIAL_WAREHOUSE_BINS));
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(() => loadStored('ledger', INITIAL_LEDGER_ENTRIES));
  const [coupons, setCoupons] = useState<CouponCode[]>(() => loadStored('coupons', INITIAL_COUPONS));
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => loadStored('auditLogs', INITIAL_AUDIT_LOGS));
  const [notifications, setNotifications] = useState<SystemNotification[]>(() => loadStored('notifications', INITIAL_NOTIFICATIONS));

  // Persistent Cart & Storefront States
  const [posCart, setPosCart] = useState<CartItem[]>(() => loadStored('posCart', []));
  const [selectedPosCustomer, setSelectedPosCustomer] = useState<Customer | null>(() => loadStored('selectedPosCustomer', null));
  const [storeCart, setStoreCart] = useState<CartItem[]>(() => loadStored('storeCart', []));
  const [wishlist, setWishlist] = useState<string[]>(() => loadStored('wishlist', []));
  const [activeCustomerUser, setActiveCustomerUser] = useState<Customer | null>(() => loadStored('activeCustomerUser', null));
  const [appliedCoupon, setAppliedCoupon] = useState<CouponCode | null>(() => loadStored('appliedCoupon', null));

  // Sync state to local storage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_wishlist`, JSON.stringify(wishlist));
      localStorage.setItem(`${STORAGE_KEY}_activeCustomerUser`, JSON.stringify(activeCustomerUser));
      localStorage.setItem(`${STORAGE_KEY}_storeCart`, JSON.stringify(storeCart));
      localStorage.setItem(`${STORAGE_KEY}_appliedCoupon`, JSON.stringify(appliedCoupon));
      localStorage.setItem(`${STORAGE_KEY}_posCart`, JSON.stringify(posCart));
      localStorage.setItem(`${STORAGE_KEY}_selectedPosCustomer`, JSON.stringify(selectedPosCustomer));
    } catch {
      // ignore
    }
  }, [wishlist, activeCustomerUser, storeCart, appliedCoupon, posCart, selectedPosCustomer]);

  // Sync state to local storage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_role`, JSON.stringify(currentRole));
      localStorage.setItem(`${STORAGE_KEY}_locationId`, JSON.stringify(currentLocationId));
      localStorage.setItem(`${STORAGE_KEY}_currencySymbol`, JSON.stringify(currencySymbol));
      localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(products));
      localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(stockMovements));
      localStorage.setItem(`${STORAGE_KEY}_transfers`, JSON.stringify(transfers));
      localStorage.setItem(`${STORAGE_KEY}_adjustments`, JSON.stringify(adjustments));
      localStorage.setItem(`${STORAGE_KEY}_suppliers`, JSON.stringify(suppliers));
      localStorage.setItem(`${STORAGE_KEY}_purchaseOrders`, JSON.stringify(purchaseOrders));
      localStorage.setItem(`${STORAGE_KEY}_orders`, JSON.stringify(orders));
      localStorage.setItem(`${STORAGE_KEY}_customers`, JSON.stringify(customers));
      localStorage.setItem(`${STORAGE_KEY}_posShift`, JSON.stringify(posShift));
      localStorage.setItem(`${STORAGE_KEY}_posShiftHistory`, JSON.stringify(posShiftHistory));
      localStorage.setItem(`${STORAGE_KEY}_heldCarts`, JSON.stringify(heldCarts));
      localStorage.setItem(`${STORAGE_KEY}_warehouseBins`, JSON.stringify(warehouseBins));
      localStorage.setItem(`${STORAGE_KEY}_ledger`, JSON.stringify(ledgerEntries));
      localStorage.setItem(`${STORAGE_KEY}_coupons`, JSON.stringify(coupons));
      localStorage.setItem(`${STORAGE_KEY}_auditLogs`, JSON.stringify(auditLogs));
      localStorage.setItem(`${STORAGE_KEY}_notifications`, JSON.stringify(notifications));
    } catch {
      // ignore storage quota errors
    }
  }, [
    currentRole,
    currentLocationId,
    currencySymbol,
    products,
    stockMovements,
    transfers,
    adjustments,
    suppliers,
    purchaseOrders,
    orders,
    customers,
    posShift,
    heldCarts,
    warehouseBins,
    ledgerEntries,
    coupons,
    auditLogs,
    notifications,
  ]);

  const currentLocation = locations.find((l) => l.id === currentLocationId) || locations[0];

  const convertCurrency = (amount: number, targetCode?: string): number => {
    const num = Number(amount || 0);
    const target = targetCode ? (supportedCurrencies.find((c) => c.code === targetCode) || currentCurrency) : currentCurrency;
    return num * target.rate;
  };

  const formatCurrency = (amount: number, targetCode?: string): string => {
    const target = targetCode ? (supportedCurrencies.find((c) => c.code === targetCode) || currentCurrency) : currentCurrency;
    const converted = convertCurrency(amount, target.code);
    
    const formattedNum = converted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (target.code === 'SLE') {
      return `Le ${formattedNum}`;
    }
    return `${target.symbol}${formattedNum}`;
  };

  const logAuditAction = (
    action: string,
    module: AuditLog['module'],
    targetId: string,
    before?: string,
    after?: string
  ) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      user: currentRole === 'E-commerce Customer' ? 'Customer Web' : `${currentRole} (${currentLocation.name.split(' ')[0]})`,
      role: currentRole,
      action,
      module,
      targetId,
      beforeValue: before,
      afterValue: after,
      ipAddress: '192.168.1.50',
    };
    setAuditLogs((prev) => [newLog, ...prev.slice(0, 199)]);
  };

  const addNotification = (title: string, message: string, type: SystemNotification['type'], linkTab?: string) => {
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title,
      message,
      type,
      isRead: false,
      linkTab,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  // Helper stock getters
  const getTotalStockForVariant = (variant: ProductVariant): number => {
    if (!variant.stockByLocation) return 0;
    return Object.values(variant.stockByLocation).reduce((sum, count) => sum + (count || 0), 0);
  };

  const getLocationStockForVariant = (variant: ProductVariant, locId: BranchLocationId): number => {
    return variant.stockByLocation?.[locId] || 0;
  };

  const getProductById = (productId: string) => products.find((p) => p.id === productId);

  const getVariantById = (productId: string, variantId: string) => {
    const prod = getProductById(productId);
    return prod?.variants.find((v) => v.id === variantId);
  };

  // Master Catalog CRUD & Generators
  const addProduct = (newProd: Product) => {
    setProducts((prev) => [newProd, ...prev]);
    logAuditAction(`Created new product ${newProd.name}`, 'Products', newProd.id, undefined, `${newProd.variants.length} variants`);
    addNotification('Product Created', `Added ${newProd.name} to master catalog.`, 'info', 'products');
  };

  const updateProduct = (updated: Product) => {
    const old = products.find((p) => p.id === updated.id);
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    logAuditAction(
      `Updated product ${updated.name}`,
      'Products',
      updated.id,
      old ? `${old.name}` : undefined,
      `Status: ${updated.status}`
    );
  };

  const deleteProduct = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    logAuditAction(`Deleted product`, 'Products', productId, prod?.name, 'Removed');
    addNotification('Product Removed', `Deleted ${prod?.name || productId} from catalog.`, 'warning', 'products');
  };

  const duplicateProduct = (productId: string): Product | undefined => {
    const orig = products.find((p) => p.id === productId);
    if (!orig) return undefined;
    const newId = `prod-${Date.now().toString(36)}`;
    const duplicated: Product = {
      ...orig,
      id: newId,
      name: `${orig.name} (Copy)`,
      slug: `${orig.slug}-copy-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      salesCount: 0,
      variants: orig.variants.map((v, idx) => ({
        ...v,
        id: `var-${newId}-${idx + 1}`,
        sku: `${v.sku}-CPY`,
        barcode: `${Math.floor(890000000000 + Math.random() * 99999999)}`,
      })),
    };
    setProducts((prev) => [duplicated, ...prev]);
    logAuditAction(`Duplicated product ${orig.name}`, 'Products', newId);
    addNotification('Product Duplicated', `Created duplicate: ${duplicated.name}`, 'info', 'products');
    return duplicated;
  };

  const generateSku = (brand: string, category: string, name: string, attributes?: { [k: string]: string }): string => {
    const bCode = (brand || 'GEN').substring(0, 3).toUpperCase();
    const cCode = (category || 'CAT').substring(0, 3).toUpperCase();
    const nWords = (name || 'ITEM').trim().split(/\s+/).map((w) => w.substring(0, 3).toUpperCase()).slice(0, 2).join('-');
    const attrCode = attributes
      ? Object.values(attributes)
          .map((v) => v.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase())
          .filter(Boolean)
          .join('-')
      : '';
    return [bCode, cCode, nWords, attrCode].filter(Boolean).join('-');
  };

  const generateBarcode = (prefix: string = '890'): string => {
    const randDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    return `${prefix}${randDigits}`;
  };

  const calculateBomAvailability = (product: Product, locationId?: BranchLocationId): number => {
    if (!product.isComposite || !product.bomItems || product.bomItems.length === 0) return 0;
    const targetLoc = locationId || currentLocationId;

    let minBuildable = Infinity;
    for (const item of product.bomItems) {
      const parentProd = products.find((p) => p.id === item.productId);
      const variant = parentProd?.variants.find((v) => v.id === item.variantId);
      const stock = variant?.stockByLocation?.[targetLoc] || 0;
      const required = item.quantityRequired || 1;
      const buildable = Math.floor(stock / required);
      if (buildable < minBuildable) minBuildable = buildable;
    }
    return minBuildable === Infinity ? 0 : minBuildable;
  };

  // Category Management
  const addCategory = (cat: Category) => {
    setCategories((prev) => [...prev, cat]);
    logAuditAction(`Created Category ${cat.name}`, 'Products', cat.id);
    addNotification('Category Added', `Created category ${cat.name}`, 'info', 'products');
  };

  const updateCategory = (cat: Category) => {
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
    logAuditAction(`Updated Category ${cat.name}`, 'Products', cat.id);
  };

  const deleteCategory = (catId: string) => {
    const target = categories.find((c) => c.id === catId);
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    logAuditAction(`Deleted Category`, 'Products', catId, target?.name);
  };

  // Brand Management
  const addBrand = (brand: Brand) => {
    setBrands((prev) => [...prev, brand]);
    logAuditAction(`Created Brand ${brand.name}`, 'Products', brand.id);
    addNotification('Brand Added', `Created brand ${brand.name}`, 'info', 'products');
  };

  const updateBrand = (brand: Brand) => {
    setBrands((prev) => prev.map((b) => (b.id === brand.id ? brand : b)));
    logAuditAction(`Updated Brand ${brand.name}`, 'Products', brand.id);
  };

  const deleteBrand = (brandId: string) => {
    const target = brands.find((b) => b.id === brandId);
    setBrands((prev) => prev.filter((b) => b.id !== brandId));
    logAuditAction(`Deleted Brand`, 'Products', brandId, target?.name);
  };

  // Unit of Measurement Management
  const addUnit = (unit: UnitOfMeasurement) => {
    setUnitsOfMeasurement((prev) => [...prev, unit]);
    logAuditAction(`Created Unit ${unit.name} (${unit.code})`, 'Products', unit.id);
  };

  const updateUnit = (unit: UnitOfMeasurement) => {
    setUnitsOfMeasurement((prev) => prev.map((u) => (u.id === unit.id ? unit : u)));
    logAuditAction(`Updated Unit ${unit.name}`, 'Products', unit.id);
  };

  const deleteUnit = (unitId: string) => {
    setUnitsOfMeasurement((prev) => prev.filter((u) => u.id !== unitId));
    logAuditAction(`Deleted Unit`, 'Products', unitId);
  };

  // Serial Numbers Registry
  const addSerialNumber = (sn: SerialNumberRecord) => {
    setSerialNumbers((prev) => [sn, ...prev]);
    logAuditAction(`Registered Serial ${sn.serialNumber}`, 'Inventory', sn.id, undefined, `${sn.productName} (${sn.status})`);
  };

  const updateSerialNumberStatus = (id: string, status: SerialNumberRecord['status'], notes?: string) => {
    setSerialNumbers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, notes: notes || s.notes } : s))
    );
    const sn = serialNumbers.find((s) => s.id === id);
    logAuditAction(`Serial ${sn?.serialNumber || id} status -> ${status}`, 'Inventory', id);
  };

  // Batch / Lot Registry
  const addBatchLot = (lot: BatchLotRecord) => {
    setBatchLots((prev) => [lot, ...prev]);
    logAuditAction(`Created Batch Lot ${lot.batchNumber}`, 'Inventory', lot.id, undefined, `Exp: ${lot.expiryDate}`);
  };

  const updateBatchLot = (lot: BatchLotRecord) => {
    setBatchLots((prev) => prev.map((l) => (l.id === lot.id ? lot : l)));
    logAuditAction(`Updated Batch Lot ${lot.batchNumber}`, 'Inventory', lot.id);
  };

  const deleteBatchLot = (lotId: string) => {
    const target = batchLots.find((l) => l.id === lotId);
    setBatchLots((prev) => prev.filter((l) => l.id !== lotId));
    if (target) {
      logAuditAction(`Deleted Batch Lot ${target.batchNumber}`, 'Inventory', lotId);
    }
  };

  const disposeExpiredBatch = (lotId: string, notes?: string) => {
    const target = batchLots.find((l) => l.id === lotId);
    if (!target || target.remainingQuantity <= 0) return;

    const qtyToDispose = target.remainingQuantity;

    // 1. Zero out batch lot remaining quantity
    setBatchLots((prev) =>
      prev.map((l) => (l.id === lotId ? { ...l, remainingQuantity: 0, notes: `${l.notes || ''} [Disposed ${qtyToDispose} units - Expired]` } : l))
    );

    // 2. Reduce product stock
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== target.productId) return prod;
        const newVariants = prod.variants.map((v) => {
          if (v.id !== target.variantId) return v;
          const currentStock = v.stockByLocation[target.locationId] || 0;
          return {
            ...v,
            stockByLocation: {
              ...v.stockByLocation,
              [target.locationId]: Math.max(0, currentStock - qtyToDispose),
            },
          };
        });
        return { ...prod, variants: newVariants };
      })
    );

    // 3. Log stock movement
    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      productId: target.productId,
      productName: target.productName,
      variantId: target.variantId,
      variantName: target.variantName,
      sku: target.sku,
      locationId: target.locationId,
      locationName: target.locationName,
      type: 'ADJUSTMENT_EXPIRED',
      quantityChange: -qtyToDispose,
      previousStock: qtyToDispose,
      newStock: 0,
      referenceId: target.batchNumber,
      reason: `Expired Lot Disposal: ${notes || 'Write-off due to expiration date reached'}`,
      performedBy: `${currentRole}`,
    };

    setStockMovements((prev) => [movement, ...prev]);
    logAuditAction(`Disposed Expired Batch Lot ${target.batchNumber}`, 'Inventory', target.id, `Qty: ${qtyToDispose}`);
    addNotification('Expired Stock Disposed', `Lot ${target.batchNumber} (${qtyToDispose} units) removed from inventory.`, 'warning', 'inventory');
  };

  // Stock Adjustments
  const createStockAdjustment = (adjData: Omit<StockAdjustment, 'id' | 'adjustmentNumber' | 'createdAt'>) => {
    const id = `adj-${Date.now()}`;
    const adjNumber = `ADJ-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newAdj: StockAdjustment = {
      ...adjData,
      id,
      adjustmentNumber: adjNumber,
      createdAt: now,
      status: 'Approved',
      approvedBy: currentRole,
    };

    // Apply adjustments to stock and create stock movements
    const movementsToAdd: StockMovement[] = [];
    const updatedProducts = products.map((prod) => {
      let productModified = false;
      const newVariants = prod.variants.map((v) => {
        const itemAdj = adjData.items.find((i) => i.productId === prod.id && i.variantId === v.id);
        if (itemAdj) {
          productModified = true;
          const prev = v.stockByLocation[adjData.locationId] || 0;
          const next = itemAdj.physicalCount;
          const diff = next - prev;

          movementsToAdd.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: now,
            productId: prod.id,
            productName: prod.name,
            variantId: v.id,
            variantName: v.name,
            sku: v.sku,
            locationId: adjData.locationId,
            locationName: adjData.locationName,
            type:
              adjData.reason === 'Damage'
                ? 'ADJUSTMENT_DAMAGE'
                : adjData.reason === 'Expired'
                ? 'ADJUSTMENT_EXPIRED'
                : 'ADJUSTMENT_STOCKTAKE',
            quantityChange: diff,
            previousStock: prev,
            newStock: next,
            referenceId: adjNumber,
            reason: `${adjData.reason}: ${adjData.notes || 'Manual stocktake count correction'}`,
            performedBy: `${currentRole}`,
          });

          return {
            ...v,
            stockByLocation: {
              ...v.stockByLocation,
              [adjData.locationId]: next,
            },
          };
        }
        return v;
      });

      return productModified ? { ...prod, variants: newVariants } : prod;
    });

    setProducts(updatedProducts);
    setStockMovements((prev) => [...movementsToAdd, ...prev]);
    setAdjustments((prev) => [newAdj, ...prev]);

    // Financial adjustment entry
    const totalVarianceValue = adjData.items.reduce((sum, item) => sum + item.totalVarianceValue, 0);
    if (totalVarianceValue !== 0) {
      const isLoss = totalVarianceValue < 0;
      const entry: LedgerEntry = {
        id: `ledg-${Date.now()}`,
        timestamp: now,
        transactionNumber: `TX-ADJ-${Math.floor(1000 + Math.random() * 9000)}`,
        source: 'INVENTORY_ADJUSTMENT',
        description: `Inventory Adjustment ${adjNumber} (${adjData.reason})`,
        referenceId: adjNumber,
        accountDebited: isLoss ? 'Inventory Shrinkage & Loss' : 'Inventory Asset',
        accountCredited: isLoss ? 'Inventory Asset' : 'Inventory Gain / Correction',
        amount: Math.abs(totalVarianceValue),
      };
      setLedgerEntries((prev) => [entry, ...prev]);
    }

    logAuditAction(`Approved Stock Adjustment ${adjNumber}`, 'Inventory', adjNumber, undefined, `Items: ${adjData.items.length}`);
    addNotification('Stock Adjustment Applied', `${adjNumber} processed for ${adjData.locationName}.`, 'warning', 'stock');
  };

  // Stock Transfers
  const createStockTransfer = (transferData: Omit<StockTransfer, 'id' | 'transferNumber' | 'createdAt' | 'updatedAt' | 'status'>) => {
    const id = `trf-${Date.now()}`;
    const transferNumber = `TRF-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newTransfer: StockTransfer = {
      ...transferData,
      id,
      transferNumber,
      status: 'Requested',
      createdAt: now,
      updatedAt: now,
      createdBy: `${currentRole}`,
    };

    setTransfers((prev) => [newTransfer, ...prev]);
    logAuditAction(`Requested Transfer ${transferNumber}`, 'Inventory', transferNumber, undefined, `${transferData.sourceLocationName} -> ${transferData.destLocationName}`);
    addNotification('Transfer Requested', `${transferNumber} from ${transferData.sourceLocationName} to ${transferData.destLocationName}.`, 'info', 'transfers');
  };

  const updateTransferStatus = (transferId: string, nextStatus: StockTransfer['status'], receivedQtys?: { [sku: string]: number }) => {
    const target = transfers.find((t) => t.id === transferId);
    if (!target) return;

    const now = new Date().toISOString();
    const movementsToAdd: StockMovement[] = [];

    if (nextStatus === 'In Transit' && target.status !== 'In Transit') {
      // Deduct from source location
      const updatedProducts = products.map((prod) => {
        const newVariants = prod.variants.map((v) => {
          const item = target.items.find((i) => i.productId === prod.id && i.variantId === v.id);
          if (item) {
            const currentStock = v.stockByLocation[target.sourceLocationId] || 0;
            const newStock = Math.max(0, currentStock - item.requestedQty);

            movementsToAdd.push({
              id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              timestamp: now,
              productId: prod.id,
              productName: prod.name,
              variantId: v.id,
              variantName: v.name,
              sku: v.sku,
              locationId: target.sourceLocationId,
              locationName: target.sourceLocationName,
              type: 'TRANSFER_OUT',
              quantityChange: -item.requestedQty,
              previousStock: currentStock,
              newStock,
              referenceId: target.transferNumber,
              reason: `Dispatched transfer to ${target.destLocationName}`,
              performedBy: `${currentRole}`,
            });

            return {
              ...v,
              stockByLocation: {
                ...v.stockByLocation,
                [target.sourceLocationId]: newStock,
              },
            };
          }
          return v;
        });
        return { ...prod, variants: newVariants };
      });
      setProducts(updatedProducts);
    }

    if (nextStatus === 'Received' && target.status !== 'Received') {
      // Add to destination location
      const updatedProducts = products.map((prod) => {
        const newVariants = prod.variants.map((v) => {
          const item = target.items.find((i) => i.productId === prod.id && i.variantId === v.id);
          if (item) {
            const qtyReceived = receivedQtys?.[item.sku] ?? item.dispatchedQty ?? item.requestedQty;
            const currentStock = v.stockByLocation[target.destLocationId] || 0;
            const newStock = currentStock + qtyReceived;

            movementsToAdd.push({
              id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              timestamp: now,
              productId: prod.id,
              productName: prod.name,
              variantId: v.id,
              variantName: v.name,
              sku: v.sku,
              locationId: target.destLocationId,
              locationName: target.destLocationName,
              type: 'TRANSFER_IN',
              quantityChange: qtyReceived,
              previousStock: currentStock,
              newStock,
              referenceId: target.transferNumber,
              reason: `Received transfer from ${target.sourceLocationName}`,
              performedBy: `${currentRole}`,
            });

            return {
              ...v,
              stockByLocation: {
                ...v.stockByLocation,
                [target.destLocationId]: newStock,
              },
            };
          }
          return v;
        });
        return { ...prod, variants: newVariants };
      });
      setProducts(updatedProducts);
    }

    if (movementsToAdd.length > 0) {
      setStockMovements((prev) => [...movementsToAdd, ...prev]);
    }

    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: nextStatus,
              updatedAt: now,
              items: t.items.map((it) => ({
                ...it,
                dispatchedQty: nextStatus === 'In Transit' ? it.requestedQty : it.dispatchedQty,
                receivedQty: nextStatus === 'Received' ? (receivedQtys?.[it.sku] ?? it.requestedQty) : it.receivedQty,
              })),
            }
          : t
      )
    );

    logAuditAction(`Updated Transfer ${target.transferNumber}`, 'Inventory', target.transferNumber, target.status, nextStatus);
  };

  const receiveStockTransfer = (transferId: string) => {
    updateTransferStatus(transferId, 'Received');
  };

  // Suppliers & Purchasing
  const addSupplier = (sup: Supplier) => {
    setSuppliers((prev) => [sup, ...prev]);
    logAuditAction(`Added Supplier ${sup.name}`, 'Purchasing', sup.id);
  };

  const updateSupplier = (sup: Supplier) => {
    setSuppliers((prev) => prev.map((s) => (s.id === sup.id ? sup : s)));
    logAuditAction(`Updated Supplier ${sup.name}`, 'Purchasing', sup.id);
  };

  const deleteSupplier = (supplierId: string) => {
    const target = suppliers.find((s) => s.id === supplierId);
    setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    if (target) {
      logAuditAction(`Deleted Supplier ${target.name}`, 'Purchasing', supplierId);
    }
  };

  const createPurchaseOrder = (poData: Omit<PurchaseOrder, 'id' | 'poNumber' | 'orderDate'>) => {
    const id = `po-${Date.now()}`;
    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const newPO: PurchaseOrder = {
      ...poData,
      id,
      poNumber,
      orderDate: now,
    };

    setPurchaseOrders((prev) => [newPO, ...prev]);
    logAuditAction(`Created Purchase Order ${poNumber}`, 'Purchasing', poNumber, undefined, `Total: ${formatCurrency(newPO.totalAmount)}`);
    addNotification('Purchase Order Generated', `${poNumber} sent to ${poData.supplierName}.`, 'info', 'purchasing');
  };

  const updatePurchaseOrderStatus = (poId: string, status: PurchaseOrder['status']) => {
    setPurchaseOrders((prev) => prev.map((p) => (p.id === poId ? { ...p, status } : p)));
    const po = purchaseOrders.find((p) => p.id === poId);
    if (po) {
      logAuditAction(`PO Status Updated`, 'Purchasing', po.poNumber, po.status, status);
    }
  };

  const receivePurchaseOrderGoods = (
    poId: string,
    receivedItems: { variantId: string; quantity: number; batchNumber?: string; expiryDate?: string }[]
  ) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    const now = new Date().toISOString();
    const movementsToAdd: StockMovement[] = [];

    // Increase stock at destination location
    const updatedProducts = products.map((prod) => {
      const newVariants = prod.variants.map((v) => {
        const itemRec = receivedItems.find((r) => r.variantId === v.id);
        if (itemRec && itemRec.quantity > 0) {
          const currentStock = v.stockByLocation[po.destinationLocationId] || 0;
          const newStock = currentStock + itemRec.quantity;

          movementsToAdd.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: now,
            productId: prod.id,
            productName: prod.name,
            variantId: v.id,
            variantName: v.name,
            sku: v.sku,
            locationId: po.destinationLocationId,
            locationName: po.destinationLocationName,
            type: 'PURCHASE_RECEIVE',
            quantityChange: itemRec.quantity,
            previousStock: currentStock,
            newStock,
            referenceId: po.poNumber,
            reason: `GRN from ${po.supplierName} (Lot: ${itemRec.batchNumber || 'N/A'})`,
            performedBy: `${currentRole}`,
          });

          return {
            ...v,
            stockByLocation: {
              ...v.stockByLocation,
              [po.destinationLocationId]: newStock,
            },
          };
        }
        return v;
      });
      return { ...prod, variants: newVariants };
    });

    setProducts(updatedProducts);
    setStockMovements((prev) => [...movementsToAdd, ...prev]);

    // Create batch lot records for received goods if batch or expiry specified
    const newBatchLots: BatchLotRecord[] = [];
    receivedItems.forEach((r) => {
      if (r.quantity > 0 && (r.batchNumber || r.expiryDate)) {
        for (const prod of products) {
          const v = prod.variants.find((varItem) => varItem.id === r.variantId);
          if (v) {
            newBatchLots.push({
              id: `lot-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              batchNumber: r.batchNumber || `LOT-${po.poNumber}-${v.sku}`,
              productId: prod.id,
              productName: prod.name,
              variantId: v.id,
              variantName: v.name,
              sku: v.sku,
              locationId: po.destinationLocationId,
              locationName: po.destinationLocationName,
              initialQuantity: r.quantity,
              remainingQuantity: r.quantity,
              unitCost: v.costPrice,
              manufactureDate: new Date().toISOString().split('T')[0],
              expiryDate: r.expiryDate || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
              supplierName: po.supplierName,
              notes: `Auto-registered via Goods Received Note for ${po.poNumber}`,
            });
            break;
          }
        }
      }
    });

    if (newBatchLots.length > 0) {
      setBatchLots((prev) => [...newBatchLots, ...prev]);
    }

    // Update PO items received count
    const updatedPOItems = po.items.map((it) => {
      const rec = receivedItems.find((r) => r.variantId === it.variantId);
      return rec ? { ...it, receivedQty: it.receivedQty + rec.quantity, batchNumber: rec.batchNumber, expiryDate: rec.expiryDate } : it;
    });

    const isFullyReceived = updatedPOItems.every((it) => it.receivedQty >= it.orderedQty);

    setPurchaseOrders((prev) =>
      prev.map((p) =>
        p.id === poId
          ? {
              ...p,
              items: updatedPOItems,
              status: isFullyReceived ? 'Received' : 'Partially Received',
              receivedDate: now,
            }
          : p
      )
    );

    // Record Accounting Ledger Entry for Inventory Inflow & Accounts Payable
    const totalReceivedValue = receivedItems.reduce((sum, r) => {
      const item = po.items.find((it) => it.variantId === r.variantId);
      return sum + (item ? item.unitCost * r.quantity : 0);
    }, 0);

    if (totalReceivedValue > 0) {
      const ledgerEntry: LedgerEntry = {
        id: `ledg-${Date.now()}`,
        timestamp: now,
        transactionNumber: `TX-GRN-${Math.floor(1000 + Math.random() * 9000)}`,
        source: 'PO_PAYMENT',
        description: `Goods Received Note for ${po.poNumber} (${po.supplierName})`,
        referenceId: po.poNumber,
        accountDebited: `Inventory Asset (${po.destinationLocationName})`,
        accountCredited: `Accounts Payable (${po.supplierName})`,
        amount: totalReceivedValue,
      };
      setLedgerEntries((prev) => [ledgerEntry, ...prev]);
    }

    logAuditAction(`Received Goods for PO ${po.poNumber}`, 'Purchasing', po.poNumber, undefined, `Received Val: ${formatCurrency(totalReceivedValue)}`);
    addNotification('Goods Received', `Received items for ${po.poNumber} at ${po.destinationLocationName}.`, 'success', 'stock');
  };

  // POS Module Operations
  const addToPosCart = (product: Product, variant: ProductVariant, quantity: number = 1) => {
    setPosCart((prev) => {
      const existing = prev.find((item) => item.variantId === variant.id);
      // Determine effective price: VIP/Member if customer has tier, else standard retail
      let unitPrice = variant.retailPrice;
      if (selectedPosCustomer) {
        if (selectedPosCustomer.tier === 'VIP') unitPrice = variant.memberPrice || variant.retailPrice;
        else if (selectedPosCustomer.customerGroup === 'Wholesale') unitPrice = variant.wholesalePrice || variant.retailPrice;
      }

      if (existing) {
        return prev.map((item) =>
          item.variantId === variant.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      } else {
        const newItem: CartItem = {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          price: unitPrice,
          originalPrice: variant.retailPrice,
          minSellingPrice: variant.minSellingPrice || Math.round(variant.retailPrice * 0.85),
          costPrice: variant.costPrice,
          quantity,
          taxRate: product.taxRate,
          image: variant.image || product.images[0],
          unit: product.unit,
        };
        return [...prev, newItem];
      }
    });
  };

  const updatePosCartItemQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      removeFromPosCart(variantId);
    } else {
      setPosCart((prev) => prev.map((item) => (item.variantId === variantId ? { ...item, quantity: qty } : item)));
    }
  };

  const updatePosCartItemDiscount = (variantId: string, discountPct: number) => {
    setPosCart((prev) =>
      prev.map((item) =>
        item.variantId === variantId ? { ...item, discountPercentage: Math.min(100, Math.max(0, discountPct)) } : item
      )
    );
  };

  const updatePosCartItemPriceAndDiscount = (
    variantId: string,
    newPrice: number,
    discountPct: number,
    overrideInfo?: { approvedBy: string; reason: string }
  ) => {
    setPosCart((prev) =>
      prev.map((item) => {
        if (item.variantId === variantId) {
          return {
            ...item,
            price: newPrice,
            discountPercentage: Math.min(100, Math.max(0, discountPct)),
            overrideApproved: !!overrideInfo,
            overrideApprovedBy: overrideInfo?.approvedBy,
            overrideReason: overrideInfo?.reason,
          };
        }
        return item;
      })
    );
  };

  const removeFromPosCart = (variantId: string) => {
    setPosCart((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  const clearPosCart = () => {
    setPosCart([]);
    setSelectedPosCustomer(null);
  };

  const holdCurrentPosCart = (note?: string) => {
    if (posCart.length === 0) return;
    const newHeld: HeldCart = {
      id: `held-${Date.now()}`,
      cartId: `CART-${Math.floor(100 + Math.random() * 900)}`,
      customerId: selectedPosCustomer?.id,
      customerName: selectedPosCustomer?.name || 'Walk-in Customer',
      items: [...posCart],
      heldAt: new Date().toISOString(),
      note,
    };
    setHeldCarts((prev) => [newHeld, ...prev]);
    clearPosCart();
    addNotification('Sale Suspended / Held', `Cart saved to queue.`, 'info', 'pos');
  };

  const resumeHeldPosCart = (heldId: string) => {
    const held = heldCarts.find((h) => h.id === heldId);
    if (!held) return;
    setPosCart(held.items);
    if (held.customerId) {
      const cust = customers.find((c) => c.id === held.customerId);
      if (cust) setSelectedPosCustomer(cust);
    }
    setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
  };

  const removeHeldPosCart = (heldId: string) => {
    setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
  };

  const processPosCheckout = (payments: PaymentRecord[], discountCode?: string): Order => {
    const now = new Date().toISOString();
    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

    let subtotal = 0;
    let totalTax = 0;
    let totalCost = 0;

    posCart.forEach((item) => {
      const lineTotal = item.price * item.quantity * (1 - (item.discountPercentage || 0) / 100);
      subtotal += lineTotal;
      totalTax += lineTotal * (item.taxRate / 100);
      totalCost += item.costPrice * item.quantity;
    });

    let extraDiscount = 0;
    if (discountCode) {
      const coup = coupons.find((c) => c.code.toUpperCase() === discountCode.toUpperCase() && c.isActive);
      if (coup) {
        extraDiscount = coup.discountType === 'fixed' ? coup.value : (subtotal * coup.value) / 100;
      }
    }

    const totalAmount = Math.max(0, subtotal - extraDiscount + totalTax);

    // Deduct stock from current POS location
    const movementsToAdd: StockMovement[] = [];
    const updatedProducts = products.map((prod) => {
      const newVariants = prod.variants.map((v) => {
        const cartItem = posCart.find((ci) => ci.variantId === v.id);
        if (cartItem) {
          const currentStock = v.stockByLocation[currentLocationId] || 0;
          const newStock = Math.max(0, currentStock - cartItem.quantity);

          movementsToAdd.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: now,
            productId: prod.id,
            productName: prod.name,
            variantId: v.id,
            variantName: v.name,
            sku: v.sku,
            locationId: currentLocationId,
            locationName: currentLocation.name,
            type: 'POS_SALE',
            quantityChange: -cartItem.quantity,
            previousStock: currentStock,
            newStock,
            referenceId: orderNumber,
            reason: `In-store checkout by ${posShift.cashierName}`,
            performedBy: posShift.cashierName,
          });

          return {
            ...v,
            stockByLocation: {
              ...v.stockByLocation,
              [currentLocationId]: newStock,
            },
          };
        }
        return v;
      });
      return { ...prod, variants: newVariants };
    });

    setProducts(updatedProducts);
    setStockMovements((prev) => [...movementsToAdd, ...prev]);

    // Loyalty points (1 point per $10 spent)
    const pointsEarned = Math.floor(totalAmount / 10);

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      source: 'POS',
      channel: `${currentLocation.name} (Term 1)`,
      locationId: currentLocationId,
      locationName: currentLocation.name,
      customerId: selectedPosCustomer?.id,
      customerName: selectedPosCustomer?.name || 'Walk-in Retail Customer',
      customerEmail: selectedPosCustomer?.email,
      customerTier: selectedPosCustomer?.tier,
      fulfillmentMethod: 'POS Walk-in',
      items: [...posCart],
      subtotal,
      discountAmount: extraDiscount,
      discountCode,
      taxAmount: totalTax,
      shippingFee: 0,
      totalAmount,
      totalCostAmount: totalCost,
      payments,
      paymentStatus: 'Paid',
      status: 'Completed',
      cashierName: posShift.cashierName,
      createdAt: now,
      updatedAt: now,
      loyaltyPointsEarned: pointsEarned,
      loyaltyPointsRedeemed: 0,
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Update customer loyalty and spent totals if identified
    if (selectedPosCustomer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedPosCustomer.id
            ? {
                ...c,
                totalSpent: c.totalSpent + totalAmount,
                ordersCount: c.ordersCount + 1,
                loyaltyPoints: c.loyaltyPoints + pointsEarned,
              }
            : c
        )
      );
    }

    // Update POS Shift Totals
    const cashPaid = payments.filter((p) => p.method === 'Cash').reduce((s, p) => s + p.amount, 0);
    const cardPaid = payments.filter((p) => p.method === 'Credit Card').reduce((s, p) => s + p.amount, 0);
    const mobilePaid = payments.filter((p) => p.method === 'Mobile Money').reduce((s, p) => s + p.amount, 0);
    const walletPaid = payments.filter((p) => p.method === 'Fintech Wallet' || p.method === 'Store Credit').reduce((s, p) => s + p.amount, 0);

    setPosShift((prev) => ({
      ...prev,
      totalSales: prev.totalSales + totalAmount,
      totalCashSales: prev.totalCashSales + cashPaid,
      totalCardSales: prev.totalCardSales + cardPaid,
      totalMobileSales: prev.totalMobileSales + mobilePaid,
      totalWalletSales: prev.totalWalletSales + walletPaid,
      closingCashCalculated: prev.closingCashCalculated + cashPaid,
      transactionsCount: prev.transactionsCount + 1,
    }));

    // Record Double-Entry General Ledger Entries
    const newLedgers: LedgerEntry[] = [
      {
        id: `ledg-${Date.now()}-1`,
        timestamp: now,
        transactionNumber: `TX-${orderNumber}-REV`,
        source: 'POS_SALE',
        description: `POS Revenue for ${orderNumber}`,
        referenceId: orderNumber,
        accountDebited: cashPaid > 0 ? 'Cash in Drawer (POS)' : 'Card/Payment Processor Clearing',
        accountCredited: 'Gross Sales Revenue',
        amount: subtotal - extraDiscount,
      },
      {
        id: `ledg-${Date.now()}-2`,
        timestamp: now,
        transactionNumber: `TX-${orderNumber}-TAX`,
        source: 'POS_SALE',
        description: `Sales Tax for ${orderNumber}`,
        referenceId: orderNumber,
        accountDebited: cashPaid > 0 ? 'Cash in Drawer (POS)' : 'Card/Payment Processor Clearing',
        accountCredited: 'Sales Tax Payable',
        amount: totalTax,
      },
      {
        id: `ledg-${Date.now()}-3`,
        timestamp: now,
        transactionNumber: `TX-${orderNumber}-COGS`,
        source: 'POS_SALE',
        description: `COGS for ${orderNumber}`,
        referenceId: orderNumber,
        accountDebited: 'Cost of Goods Sold (COGS)',
        accountCredited: `Inventory Asset (${currentLocation.name})`,
        amount: totalCost,
      },
    ];
    setLedgerEntries((prev) => [...newLedgers, ...prev]);

    logAuditAction(`POS Checkout ${orderNumber}`, 'POS', orderNumber, undefined, `Total: ${formatCurrency(totalAmount)}`);
    clearPosCart();
    return newOrder;
  };

  const processPosReturn = (
    orderId: string,
    returnItems: { variantId: string; quantity: number; reason: string; restock: boolean }[],
    refundAmount: number
  ) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const now = new Date().toISOString();
    const movementsToAdd: StockMovement[] = [];

    const updatedProducts = products.map((prod) => {
      const newVariants = prod.variants.map((v) => {
        const retItem = returnItems.find((r) => r.variantId === v.id);
        if (retItem && retItem.restock) {
          const currentStock = v.stockByLocation[order.locationId] || 0;
          const newStock = currentStock + retItem.quantity;

          movementsToAdd.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: now,
            productId: prod.id,
            productName: prod.name,
            variantId: v.id,
            variantName: v.name,
            sku: v.sku,
            locationId: order.locationId,
            locationName: order.locationName,
            type: 'SALE_RETURN',
            quantityChange: retItem.quantity,
            previousStock: currentStock,
            newStock,
            referenceId: order.orderNumber,
            reason: `Return refund: ${retItem.reason}`,
            performedBy: `${currentRole}`,
          });

          return {
            ...v,
            stockByLocation: {
              ...v.stockByLocation,
              [order.locationId]: newStock,
            },
          };
        }
        return v;
      });
      return { ...prod, variants: newVariants };
    });

    setProducts(updatedProducts);
    setStockMovements((prev) => [...movementsToAdd, ...prev]);

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              paymentStatus: refundAmount >= o.totalAmount ? 'Refunded' : 'Partially Refunded',
              status: refundAmount >= o.totalAmount ? 'Refunded' : o.status,
            }
          : o
      )
    );

    // Financial ledger reversal
    const ledgerEntry: LedgerEntry = {
      id: `ledg-${Date.now()}`,
      timestamp: now,
      transactionNumber: `TX-REF-${order.orderNumber}`,
      source: 'SALE_REFUND',
      description: `Refund for ${order.orderNumber}`,
      referenceId: order.orderNumber,
      accountDebited: 'Sales Returns & Allowances',
      accountCredited: 'Cash in Drawer / Refund Payable',
      amount: refundAmount,
    };
    setLedgerEntries((prev) => [ledgerEntry, ...prev]);

    setPosShift((prev) => ({
      ...prev,
      totalRefunds: prev.totalRefunds + refundAmount,
      closingCashCalculated: Math.max(0, prev.closingCashCalculated - refundAmount),
    }));

    logAuditAction(`Processed Return for ${order.orderNumber}`, 'POS', order.orderNumber, undefined, `Refund: ${formatCurrency(refundAmount)}`);
    addNotification('Return Processed', `Refunded ${formatCurrency(refundAmount)} on ${order.orderNumber}.`, 'warning', 'pos');
  };

  const openPosShift = (openingCash: number, cashierName: string) => {
    const newShift: PosShift = {
      id: `shift-${Date.now()}`,
      terminalId: 'POS-01',
      cashierName,
      openedAt: new Date().toISOString(),
      openingCash,
      closingCashCalculated: openingCash,
      totalSales: 0,
      totalCashSales: 0,
      totalCardSales: 0,
      totalMobileSales: 0,
      totalWalletSales: 0,
      totalRefunds: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
      cashMovements: [],
      transactionsCount: 0,
      status: 'Open',
    };
    setPosShift(newShift);
    logAuditAction(`Opened POS Shift with ${formatCurrency(openingCash)}`, 'POS', newShift.id);
  };

  const addPosCashMovement = (
    type: 'Cash In' | 'Cash Out',
    amount: number,
    reason: string,
    approvedBy?: string
  ) => {
    if (amount <= 0) return;
    const now = new Date().toISOString();
    const movement: CashMovement = {
      id: `mvt-${Date.now()}`,
      type,
      amount,
      reason,
      cashierName: posShift.cashierName || 'Elena Rostova',
      performedAt: now,
      approvedBy,
    };

    setPosShift((prev) => {
      const currentIn = prev.cashInTotal || 0;
      const currentOut = prev.cashOutTotal || 0;
      const newIn = type === 'Cash In' ? currentIn + amount : currentIn;
      const newOut = type === 'Cash Out' ? currentOut + amount : currentOut;
      const movements = [...(prev.cashMovements || []), movement];
      const delta = type === 'Cash In' ? amount : -amount;
      const newCalculatedCash = Math.max(0, prev.closingCashCalculated + delta);

      return {
        ...prev,
        cashInTotal: newIn,
        cashOutTotal: newOut,
        cashMovements: movements,
        closingCashCalculated: newCalculatedCash,
      };
    });

    // Record Ledger Entry
    const ledgerEntry: LedgerEntry = {
      id: `ledg-mvt-${Date.now()}`,
      timestamp: now,
      transactionNumber: `TX-CASH-${type === 'Cash In' ? 'IN' : 'OUT'}-${Date.now().toString().slice(-4)}`,
      source: 'POS_CASH_MOVEMENT',
      description: `POS ${type}: ${reason}${approvedBy ? ` (Approved by ${approvedBy})` : ''}`,
      referenceId: posShift.id,
      accountDebited: type === 'Cash In' ? 'POS Cash Drawer' : 'Petty Cash / Store Expense',
      accountCredited: type === 'Cash In' ? 'Cash Float / Bank Deposit' : 'POS Cash Drawer',
      amount,
    };
    setLedgerEntries((prev) => [ledgerEntry, ...prev]);

    logAuditAction(`POS Register ${type}`, 'POS', posShift.id, undefined, `${formatCurrency(amount)} - ${reason}`);
    addNotification(`Register ${type} Recorded`, `${type} of ${formatCurrency(amount)} logged.`, type === 'Cash In' ? 'info' : 'warning', 'pos');
  };

  const closePosShift = (
    actualCash: number,
    closeOptions?: {
      secondCount?: number;
      verifierName?: string;
      varianceReason?: PosShiftReconciliation['varianceReason'];
      denominations?: CashDenominations;
      supervisorApproved?: boolean;
      supervisorName?: string;
      notes?: string;
    }
  ) => {
    const now = new Date().toISOString();
    const diff = actualCash - posShift.closingCashCalculated;
    const ledgerId = `ledg-shf-${Date.now()}`;

    const recon: PosShiftReconciliation = {
      primaryCount: actualCash,
      secondCount: closeOptions?.secondCount ?? actualCash,
      isDoubleChecked: true,
      verifierName: closeOptions?.verifierName || `${currentRole} Double-Check`,
      variance: diff,
      varianceReason: closeOptions?.varianceReason || (diff === 0 ? 'Balanced' : 'Other'),
      denominations: closeOptions?.denominations,
      supervisorApproved: closeOptions?.supervisorApproved ?? true,
      supervisorName: closeOptions?.supervisorName || 'Marcus Vance (Store Manager)',
      ledgerEntryId: ledgerId,
      reconciledAt: now,
    };

    const closedShift: PosShift = {
      ...posShift,
      status: 'Closed',
      closedAt: now,
      closingCashActual: actualCash,
      cashDifference: diff,
      notes: closeOptions?.notes || posShift.notes,
      reconciliation: recon,
    };

    setPosShift(closedShift);
    setPosShiftHistory((prev) => [closedShift, ...prev]);

    // Financial Ledger Integration: Automatically post double-entry reconciliation to General Ledger
    const ledgerEntry: LedgerEntry = {
      id: ledgerId,
      timestamp: now,
      transactionNumber: `TX-SHF-${posShift.id.slice(-6).toUpperCase()}`,
      source: 'POS_SHIFT_RECONCILIATION',
      description: `POS Shift Reconciled (${posShift.cashierName} @ ${currentLocation.name}) - ${
        diff === 0
          ? 'Balanced Register'
          : diff > 0
          ? `Cash Overage (+${formatCurrency(diff)}) [${recon.varianceReason}]`
          : `Cash Shortage (-${formatCurrency(Math.abs(diff))}) [${recon.varianceReason}]`
      }`,
      referenceId: posShift.id,
      accountDebited:
        diff < 0
          ? 'Cash Shortage & Overage Expense (POS Variance)'
          : `POS Cash Drawer & Vault Deposit (${currentLocation.name})`,
      accountCredited:
        diff > 0
          ? 'Cash Shortage & Overage Income (POS Variance)'
          : `POS Operating Sales Clearing Account (${currentLocation.name})`,
      amount: Math.abs(diff) > 0 ? Math.abs(diff) : actualCash,
    };

    setLedgerEntries((prev) => [ledgerEntry, ...prev]);

    logAuditAction(
      `Closed & Reconciled POS Shift ${posShift.id}`,
      'POS',
      posShift.id,
      undefined,
      `Variance: ${formatCurrency(diff)} (${recon.varianceReason})`
    );

    addNotification(
      'POS Shift Reconciled & Posted to Ledger',
      `Shift ${posShift.id} closed. Double-check verified. Cash variance: ${formatCurrency(diff)}. Entry #${ledgerEntry.transactionNumber} posted to General Ledger.`,
      diff === 0 ? 'success' : 'warning',
      'pos'
    );
  };

  // E-Commerce Storefront
  const addToStoreCart = (product: Product, variant: ProductVariant, quantity: number = 1) => {
    setStoreCart((prev) => {
      const existing = prev.find((item) => item.variantId === variant.id);
      if (existing) {
        return prev.map((item) =>
          item.variantId === variant.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      } else {
        const newItem: CartItem = {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          price: variant.retailPrice,
          costPrice: variant.costPrice,
          quantity,
          taxRate: product.taxRate,
          image: variant.image || product.images[0],
          unit: product.unit,
        };
        return [...prev, newItem];
      }
    });
  };

  const updateStoreCartQty = (variantId: string, qty: number) => {
    if (qty <= 0) {
      removeFromStoreCart(variantId);
    } else {
      setStoreCart((prev) => prev.map((item) => (item.variantId === variantId ? { ...item, quantity: qty } : item)));
    }
  };

  const removeFromStoreCart = (variantId: string) => {
    setStoreCart((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  const clearStoreCart = () => {
    setStoreCart([]);
    setAppliedCoupon(null);
  };

  const applyCoupon = (code: string) => {
    const found = coupons.find((c) => c.code.toUpperCase() === code.trim().toUpperCase() && c.isActive);
    if (!found) {
      return { success: false, message: 'Invalid or expired coupon code.' };
    }
    setAppliedCoupon(found);
    return { success: true, message: `Coupon ${found.code} applied successfully!` };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      const exists = prev.includes(productId);
      if (exists) {
        return prev.filter((id) => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const isInWishlist = (productId: string) => {
    return wishlist.includes(productId);
  };

  const addProductReview = (productId: string, reviewData: Omit<ProductReview, 'id' | 'date' | 'helpfulCount'>) => {
    const newRev: ProductReview = {
      ...reviewData,
      id: `rev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      date: new Date().toISOString(),
      helpfulCount: 0,
    };

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const currentList = p.reviewsList || [];
        const updatedList = [newRev, ...currentList];
        const newReviewCount = (p.reviewCount || 0) + 1;
        const totalRatingSum = currentList.reduce((s, r) => s + r.rating, 0) + newRev.rating;
        const newRating = Number((totalRatingSum / updatedList.length).toFixed(1));

        return {
          ...p,
          rating: newRating,
          reviewCount: newReviewCount,
          reviewsList: updatedList,
        };
      })
    );

    addNotification('Review Submitted', `Thank you for reviewing! Your feedback has been published.`, 'success', 'storefront');
  };

  const placeEcommerceOrder = (orderData: {
    customer: { name: string; email: string; phone: string; address: { street: string; city: string; state: string; zip: string; country: string } };
    fulfillmentMethod: 'Standard Delivery' | 'Express Delivery' | 'In-Store Pickup';
    paymentMethod: 'Credit Card' | 'Mobile Money' | 'Fintech Wallet';
    smsOptIn?: boolean;
    whatsappOptIn?: boolean;
  }): Order => {
    const now = new Date().toISOString();
    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

    let subtotal = 0;
    let totalTax = 0;
    let totalCost = 0;

    storeCart.forEach((item) => {
      const lineTotal = item.price * item.quantity;
      subtotal += lineTotal;
      totalTax += lineTotal * (item.taxRate / 100);
      totalCost += item.costPrice * item.quantity;
    });

    let discountAmount = 0;
    if (appliedCoupon) {
      discountAmount = appliedCoupon.discountType === 'fixed' ? appliedCoupon.value : (subtotal * appliedCoupon.value) / 100;
    }

    const shippingFee = orderData.fulfillmentMethod === 'Express Delivery' ? 15 : orderData.fulfillmentMethod === 'Standard Delivery' ? 5 : 0;
    const totalAmount = Math.max(0, subtotal - discountAmount + totalTax + shippingFee);

    // E-commerce orders are fulfilled primarily from Central Logistics Warehouse ('loc-main-wh')
    const fulfillmentLocId: BranchLocationId = 'loc-main-wh';
    const fulfillmentLoc = locations.find((l) => l.id === fulfillmentLocId) || locations[0];

    // Deduct / Reserve stock immediately
    const movementsToAdd: StockMovement[] = [];
    const updatedProducts = products.map((prod) => {
      const newVariants = prod.variants.map((v) => {
        const cartItem = storeCart.find((ci) => ci.variantId === v.id);
        if (cartItem) {
          const currentStock = v.stockByLocation[fulfillmentLocId] || 0;
          const newStock = Math.max(0, currentStock - cartItem.quantity);

          movementsToAdd.push({
            id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: now,
            productId: prod.id,
            productName: prod.name,
            variantId: v.id,
            variantName: v.name,
            sku: v.sku,
            locationId: fulfillmentLocId,
            locationName: fulfillmentLoc.name,
            type: 'ECOMMERCE_SALE',
            quantityChange: -cartItem.quantity,
            previousStock: currentStock,
            newStock,
            referenceId: orderNumber,
            reason: `Online Store Order ${orderNumber} (${orderData.customer.name})`,
            performedBy: 'Online Storefront',
          });

          return {
            ...v,
            stockByLocation: {
              ...v.stockByLocation,
              [fulfillmentLocId]: newStock,
            },
          };
        }
        return v;
      });
      return { ...prod, variants: newVariants };
    });

    setProducts(updatedProducts);
    setStockMovements((prev) => [...movementsToAdd, ...prev]);

    const paymentRecord: PaymentRecord = {
      method: orderData.paymentMethod,
      amount: totalAmount,
      reference: `ECOM-GATEWAY-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: now,
    };

    const magicToken = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const carrier = orderData.fulfillmentMethod === 'Express Delivery' ? 'FedEx Priority Overnight' : orderData.fulfillmentMethod === 'Standard Delivery' ? 'OmniTrack / DHL Ground' : 'Direct Store Pickup';
    const trackingCode = orderData.fulfillmentMethod === 'In-Store Pickup' ? `PICKUP-${orderNumber}` : `TRK-OMNI-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const initialSmsLogs = [];
    if (orderData.smsOptIn) {
      initialSmsLogs.push({
        timestamp: now,
        channel: 'SMS' as const,
        message: `Order #${orderNumber} confirmed! Total: ${formatCurrency(totalAmount)}. Direct tracking: store.com/orders/track?id=${orderNumber}&token=${magicToken}`,
        status: 'Delivered' as const,
      });
    }
    if (orderData.whatsappOptIn) {
      initialSmsLogs.push({
        timestamp: now,
        channel: 'WhatsApp' as const,
        message: `✨ Hi ${orderData.customer.name.split(' ')[0]}! Your order #${orderNumber} is confirmed at OmniCore. We'll update you here at each milestone!`,
        status: 'Delivered' as const,
      });
    }

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      source: 'ECOMMERCE',
      channel: 'Online Web Store',
      locationId: fulfillmentLocId,
      locationName: fulfillmentLoc.name,
      customerName: orderData.customer.name,
      customerEmail: orderData.customer.email,
      customerPhone: orderData.customer.phone,
      shippingAddress: orderData.customer.address,
      fulfillmentMethod: orderData.fulfillmentMethod,
      carrierName: carrier,
      trackingNumber: trackingCode,
      trackingMagicToken: magicToken,
      smsOptIn: orderData.smsOptIn ?? true,
      whatsappOptIn: orderData.whatsappOptIn ?? true,
      smsUpdatesLog: initialSmsLogs,
      items: [...storeCart],
      subtotal,
      discountAmount,
      discountCode: appliedCoupon?.code,
      taxAmount: totalTax,
      shippingFee,
      totalAmount,
      totalCostAmount: totalCost,
      payments: [paymentRecord],
      paymentStatus: 'Paid',
      status: 'Stock Reserved',
      createdAt: now,
      updatedAt: now,
      loyaltyPointsEarned: Math.floor(totalAmount / 10),
      loyaltyPointsRedeemed: 0,
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Financial Ledger Entries
    const ledgers: LedgerEntry[] = [
      {
        id: `ledg-${Date.now()}-ecom1`,
        timestamp: now,
        transactionNumber: `TX-${orderNumber}-ECOM`,
        source: 'ECOMMERCE_SALE',
        description: `E-Commerce Sale ${orderNumber}`,
        referenceId: orderNumber,
        accountDebited: 'Online Gateway Clearing (Stripe/PayPal)',
        accountCredited: 'Gross Sales Revenue',
        amount: subtotal - discountAmount,
      },
      {
        id: `ledg-${Date.now()}-ecom2`,
        timestamp: now,
        transactionNumber: `TX-${orderNumber}-COGS`,
        source: 'ECOMMERCE_SALE',
        description: `COGS for E-com ${orderNumber}`,
        referenceId: orderNumber,
        accountDebited: 'Cost of Goods Sold (COGS)',
        accountCredited: `Inventory Asset (${fulfillmentLoc.name})`,
        amount: totalCost,
      },
    ];
    setLedgerEntries((prev) => [...ledgers, ...prev]);

    logAuditAction(`Online Order Placed ${orderNumber}`, 'Orders', orderNumber, undefined, `Amount: ${formatCurrency(totalAmount)}`);
    addNotification('New Online Order Placed', `${orderNumber} received for ${formatCurrency(totalAmount)}.`, 'info', 'orders');
    clearStoreCart();
    return newOrder;
  };

  // Retroactive Account Claiming & Unified Guest Linking
  const claimGuestOrders = (email: string, targetCustomerId?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const matchingOrders = orders.filter(
      (o) => o.customerEmail?.trim().toLowerCase() === cleanEmail
    );

    if (matchingOrders.length === 0) {
      return { claimedCount: 0, pointsAdded: 0, totalSpentAdded: 0, claimedOrders: [] };
    }

    const totalPoints = matchingOrders.reduce((sum, o) => sum + (o.loyaltyPointsEarned || Math.floor(o.totalAmount / 10)), 0);
    const totalSpent = matchingOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // Update orders to attach customerId if target provided
    if (targetCustomerId) {
      setOrders((prev) =>
        prev.map((o) =>
          o.customerEmail?.trim().toLowerCase() === cleanEmail
            ? { ...o, customerId: targetCustomerId }
            : o
        )
      );

      // Update customer profile totals
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === targetCustomerId
            ? {
                ...c,
                totalSpent: c.totalSpent + totalSpent,
                ordersCount: c.ordersCount + matchingOrders.length,
                loyaltyPoints: c.loyaltyPoints + totalPoints,
              }
            : c
        )
      );
    }

    logAuditAction(`Claimed ${matchingOrders.length} guest orders for ${cleanEmail}`, 'CRM', targetCustomerId || cleanEmail);
    addNotification(
      'Guest Orders Linked',
      `Attached ${matchingOrders.length} prior guest order(s) to account with ${totalPoints} loyalty points.`,
      'success',
      'storefront'
    );

    return {
      claimedCount: matchingOrders.length,
      pointsAdded: totalPoints,
      totalSpentAdded: totalSpent,
      claimedOrders: matchingOrders,
    };
  };

  const registerNewCustomer = (customerData: {
    name: string;
    email: string;
    phone: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  }) => {
    const cleanEmail = customerData.email.trim().toLowerCase();
    const newCustId = `cust-${Date.now()}`;
    const now = new Date().toISOString();

    // Look for matching prior guest orders
    const pastGuestOrders = orders.filter(
      (o) => o.customerEmail?.trim().toLowerCase() === cleanEmail
    );

    const pastPoints = pastGuestOrders.reduce((sum, o) => sum + (o.loyaltyPointsEarned || Math.floor(o.totalAmount / 10)), 0);
    const pastSpent = pastGuestOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const welcomeBonusPoints = 50; // New member sign-up bonus

    const newCustomer: Customer = {
      id: newCustId,
      name: customerData.name.trim(),
      email: customerData.email.trim(),
      phone: customerData.phone.trim(),
      tier: 'Bronze',
      loyaltyPoints: pastPoints + welcomeBonusPoints,
      storeCreditBalance: 0,
      creditLimit: 500,
      totalSpent: pastSpent,
      ordersCount: pastGuestOrders.length,
      addresses: customerData.street
        ? [
            {
              id: `addr-${Date.now()}`,
              label: 'Home',
              street: customerData.street,
              city: customerData.city || '',
              zip: customerData.zip || '',
              isDefault: true,
            },
          ]
        : [],
      customerGroup: 'Retail',
      registeredAt: now,
    };

    setCustomers((prev) => [newCustomer, ...prev]);
    setActiveCustomerUser(newCustomer);

    // Retroactively link orders
    if (pastGuestOrders.length > 0) {
      setOrders((prev) =>
        prev.map((o) =>
          o.customerEmail?.trim().toLowerCase() === cleanEmail
            ? { ...o, customerId: newCustId }
            : o
        )
      );
    }

    logAuditAction(`Registered Account ${newCustomer.name}`, 'CRM', newCustomer.id);
    addNotification(
      'Account Created & Claimed',
      `Welcome ${newCustomer.name}! Linked ${pastGuestOrders.length} prior order(s) + 50 Welcome bonus points.`,
      'success',
      'storefront'
    );

    return {
      customer: newCustomer,
      claimedOrdersCount: pastGuestOrders.length,
      pointsAdded: pastPoints + welcomeBonusPoints,
    };
  };

  // Milestone Progression Simulator with Automatic SMS/WhatsApp Dispatch
  const simulateAdvanceOrderStatus = (orderId: string): Order | undefined => {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return undefined;

    const lifecycle: OrderStatus[] = [
      'Pending',
      'Payment Confirmed',
      'Picking',
      'Dispatched',
      'Delivered',
    ];

    let currentIdx = lifecycle.indexOf(ord.status);
    if (currentIdx === -1) {
      if (ord.status === 'Stock Reserved') currentIdx = 0;
      else if (ord.status === 'Packed') currentIdx = 2;
      else if (ord.status === 'Completed') currentIdx = 4;
      else currentIdx = 0;
    }

    const nextIdx = (currentIdx + 1) % lifecycle.length;
    const nextStatus = lifecycle[nextIdx];
    const now = new Date().toISOString();

    let milestoneAlertMsg = '';
    if (nextStatus === 'Payment Confirmed') {
      milestoneAlertMsg = `Payment confirmed for Order #${ord.orderNumber}. Warehouse picking initiated.`;
    } else if (nextStatus === 'Picking') {
      milestoneAlertMsg = `📦 Packing in progress! Items are being prepared at Central Logistics Warehouse.`;
    } else if (nextStatus === 'Dispatched') {
      milestoneAlertMsg = `🚚 Order #${ord.orderNumber} has shipped via ${ord.carrierName || 'OmniTrack Express'} (${ord.trackingNumber || 'TRK-LIVE'}). Live tracking: store.com/orders/track?id=${ord.orderNumber}`;
    } else if (nextStatus === 'Delivered') {
      milestoneAlertMsg = `🎉 Delivered! Order #${ord.orderNumber} arrived at destination address. Thank you for shopping with us!`;
    } else {
      milestoneAlertMsg = `Order #${ord.orderNumber} reset to ${nextStatus}.`;
    }

    const updatedLogs = [...(ord.smsUpdatesLog || [])];
    if (ord.smsOptIn && milestoneAlertMsg) {
      updatedLogs.push({
        timestamp: now,
        channel: 'SMS',
        message: milestoneAlertMsg,
        status: 'Delivered',
      });
    }
    if (ord.whatsappOptIn && milestoneAlertMsg) {
      updatedLogs.push({
        timestamp: now,
        channel: 'WhatsApp',
        message: `Milestone Alert: ${milestoneAlertMsg}`,
        status: 'Delivered',
      });
    }

    const updatedOrder: Order = {
      ...ord,
      status: nextStatus,
      updatedAt: now,
      smsUpdatesLog: updatedLogs,
    };

    setOrders((prev) => prev.map((o) => (o.id === orderId ? updatedOrder : o)));
    logAuditAction(`Order ${ord.orderNumber} advanced to ${nextStatus}`, 'Orders', ord.orderNumber, ord.status, nextStatus);
    addNotification(`Order ${ord.orderNumber} → ${nextStatus}`, milestoneAlertMsg, 'info', 'orders');

    return updatedOrder;
  };

  const sendCustomerAlert = (orderId: string, channel: 'SMS' | 'WhatsApp', message: string) => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const currentLogs = o.smsUpdatesLog || [];
        return {
          ...o,
          smsUpdatesLog: [
            ...currentLogs,
            {
              timestamp: now,
              channel,
              message,
              status: 'Delivered',
            },
          ],
        };
      })
    );
    addNotification(`Manual ${channel} Sent`, message, 'success', 'storefront');
  };

  // Orders Fulfillment Pipeline
  const updateOrderStatus = (orderId: string, status: OrderStatus, trackingNumber?: string) => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              trackingNumber: trackingNumber || o.trackingNumber,
              updatedAt: now,
            }
          : o
      )
    );
    const ord = orders.find((o) => o.id === orderId);
    if (ord) {
      logAuditAction(`Order ${ord.orderNumber} status changed to ${status}`, 'Orders', ord.orderNumber, ord.status, status);
      addNotification(`Order ${ord.orderNumber} ${status}`, `Fulfillment status changed to ${status}.`, 'info', 'orders');
    }
  };

  // CRM
  const addCustomer = (cust: Customer) => {
    setCustomers((prev) => [cust, ...prev]);
    logAuditAction(`Created Customer Profile ${cust.name}`, 'CRM', cust.id);
  };

  const updateCustomer = (cust: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === cust.id ? cust : c)));
    logAuditAction(`Updated Customer ${cust.name}`, 'CRM', cust.id);
  };

  const adjustCustomerCredit = (customerId: string, amount: number, note?: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, storeCreditBalance: Math.max(0, c.storeCreditBalance + amount) } : c))
    );
    logAuditAction(`Adjusted store credit for customer`, 'CRM', customerId, undefined, `Delta: ${formatCurrency(amount)} (${note || ''})`);
  };

  const adjustCustomerLoyalty = (customerId: string, points: number, note?: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, loyaltyPoints: Math.max(0, c.loyaltyPoints + points) } : c))
    );
    logAuditAction(`Adjusted loyalty points for customer`, 'CRM', customerId, undefined, `Delta: ${points} pts (${note || ''})`);
  };

  // Warehouse Bins
  const updateBinItemAllocation = (binId: string, variantId: string, deltaQty: number) => {
    setWarehouseBins((prev) =>
      prev.map((b) => {
        if (b.id !== binId) return b;
        const existing = b.currentItems.find((i) => i.variantId === variantId);
        if (existing) {
          const newQty = Math.max(0, existing.quantity + deltaQty);
          return {
            ...b,
            currentItems: newQty === 0 ? b.currentItems.filter((i) => i.variantId !== variantId) : b.currentItems.map((i) => (i.variantId === variantId ? { ...i, quantity: newQty } : i)),
          };
        }
        return b;
      })
    );
  };

  const addCoupon = (coupon: CouponCode) => {
    setCoupons((prev) => [coupon, ...prev]);
    logAuditAction(`Created Coupon ${coupon.code}`, 'Settings', coupon.id);
  };

  const resetToDefaultData = () => {
    setProducts(INITIAL_PRODUCTS);
    setCategories(INITIAL_CATEGORIES);
    setBrands(INITIAL_BRANDS);
    setUnitsOfMeasurement(INITIAL_UNITS);
    setSerialNumbers(INITIAL_SERIAL_NUMBERS);
    setBatchLots(INITIAL_BATCH_LOTS);
    setStockMovements(INITIAL_STOCK_MOVEMENTS);
    setTransfers([]);
    setAdjustments([]);
    setSuppliers(INITIAL_SUPPLIERS);
    setPurchaseOrders(INITIAL_PURCHASE_ORDERS);
    setOrders(INITIAL_ORDERS);
    setCustomers(INITIAL_CUSTOMERS);
    setPosShift(INITIAL_POS_SHIFT);
    setHeldCarts([]);
    setWarehouseBins(INITIAL_WAREHOUSE_BINS);
    setLedgerEntries(INITIAL_LEDGER_ENTRIES);
    setCoupons(INITIAL_COUPONS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setPosCart([]);
    setStoreCart([]);
    setAppliedCoupon(null);
    setSelectedPosCustomer(null);
    logAuditAction('System reset to default seed state', 'Settings', 'SYSTEM');
    addNotification('System Reset', 'All database records refreshed to baseline.', 'info');
  };

  return (
    <CommerceContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        currentLocationId,
        setCurrentLocationId,
        currentLocation,
        locations,
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        duplicateProduct,
        getProductById,
        getVariantById,
        generateSku,
        generateBarcode,
        calculateBomAvailability,
        categories,
        setCategories,
        addCategory,
        updateCategory,
        deleteCategory,
        brands,
        setBrands,
        addBrand,
        updateBrand,
        deleteBrand,
        unitsOfMeasurement,
        setUnitsOfMeasurement,
        addUnit,
        updateUnit,
        deleteUnit,
        serialNumbers,
        setSerialNumbers,
        addSerialNumber,
        updateSerialNumberStatus,
        batchLots,
        setBatchLots,
        addBatchLot,
        updateBatchLot,
        deleteBatchLot,
        disposeExpiredBatch,
        stockMovements,
        transfers,
        stockTransfers: transfers,
        adjustments,
        createStockAdjustment,
        createStockTransfer,
        updateTransferStatus,
        receiveStockTransfer,
        getTotalStockForVariant,
        getLocationStockForVariant,
        suppliers,
        purchaseOrders,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        createPurchaseOrder,
        updatePurchaseOrderStatus,
        receivePurchaseOrderGoods,
        posShift,
        posShiftHistory,
        posCart,
        selectedPosCustomer,
        heldCarts,
        addToPosCart,
        updatePosCartItemQty,
        updatePosCartItemDiscount,
        updatePosCartItemPriceAndDiscount,
        removeFromPosCart,
        clearPosCart,
        setSelectedPosCustomer,
        holdCurrentPosCart,
        resumeHeldPosCart,
        removeHeldPosCart,
        processPosCheckout,
        processPosReturn,
        openPosShift,
        addPosCashMovement,
        closePosShift,
        storeCart,
        wishlist,
        toggleWishlist,
        isInWishlist,
        activeCustomerUser,
        setActiveCustomerUser,
        addProductReview,
        appliedCoupon,
        addToStoreCart,
        updateStoreCartQty,
        removeFromStoreCart,
        clearStoreCart,
        applyCoupon,
        removeCoupon,
        placeEcommerceOrder,
        claimGuestOrders,
        registerNewCustomer,
        simulateAdvanceOrderStatus,
        sendCustomerAlert,
        orders,
        updateOrderStatus,
        customers,
        addCustomer,
        updateCustomer,
        adjustCustomerCredit,
        adjustCustomerLoyalty,
        warehouseBins,
        updateBinItemAllocation,
        ledgerEntries,
        coupons,
        addCoupon,
        auditLogs,
        notifications,
        markNotificationAsRead,
        clearAllNotifications,
        logAuditAction,
        theme,
        isDarkMode,
        toggleTheme,
        setTheme,
        currencyCode,
        setCurrencyCode,
        currencySymbol,
        setCurrencySymbol,
        currentCurrency,
        supportedCurrencies,
        convertCurrency,
        formatCurrency,
        refreshExchangeRates,
        isRatesLoading,
        lastRatesUpdate,
        resetToDefaultData,
      }}
    >
      {children}
    </CommerceContext.Provider>
  );
};

export const useCommerce = () => {
  const context = useContext(CommerceContext);
  if (!context) {
    throw new Error('useCommerce must be used within a CommerceProvider');
  }
  return context;
};
