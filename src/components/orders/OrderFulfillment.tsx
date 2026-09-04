import React, { useState } from 'react';
import {
  ShoppingBag,
  Search,
  Truck,
  CheckCircle2,
  Building2,
  Globe,
  Monitor,
  Printer,
  Package,
  X,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Order, OrderStatus } from '../../types';

export const OrderFulfillment: React.FC = () => {
  const { orders, updateOrderStatus, formatCurrency } = useCommerce();

  const [channelFilter, setChannelFilter] = useState<'All' | 'POS' | 'ECOMMERCE' | 'WHOLESALE'>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Tracking form
  const [carrierName, setCarrierName] = useState('FedEx Express');
  const [trackingNumberInput, setTrackingNumberInput] = useState('');

  const filteredOrders = orders.filter((o) => {
    const matchesChannel = channelFilter === 'All' || o.source === channelFilter;
    const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerName && o.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      o.items.some((i) => i.productName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesChannel && matchesStatus && matchesSearch;
  });

  const handleUpdateStatus = (orderId: string, newStatus: OrderStatus) => {
    const trk = newStatus === 'Dispatched' ? trackingNumberInput || `${carrierName}: TRK-` + Math.floor(10000000 + Math.random() * 90000000) : undefined;
    updateOrderStatus(orderId, newStatus, trk);
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus, trackingNumber: trk || prev.trackingNumber } : null));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-blue-600" />
            <span>Multi-Channel Order Fulfillment</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Unified pipeline managing POS transactions, web storefront shipments, and click & collect pickups
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold">
          <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
            {orders.filter((o) => o.status === 'Stock Reserved' || o.status === 'Pending').length} Pending Pick
          </span>
          <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
            {orders.filter((o) => o.status === 'Picking' || o.status === 'Packed').length} In Warehouse
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search order #, customer, item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* Channel filter pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto custom-scrollbar w-full sm:w-auto">
          {(['All', 'ECOMMERCE', 'POS', 'WHOLESALE'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                channelFilter === ch
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {ch === 'ECOMMERCE' ? 'E-Commerce' : ch}
            </button>
          ))}
        </div>

        {/* Status Dropdown */}
        <select
          aria-label="Filter by order status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg py-1.5 px-3 w-full sm:w-auto focus:outline-none focus:border-blue-500"
        >
          <option value="All">All Statuses</option>
          <option value="Stock Reserved">Stock Reserved</option>
          <option value="Picking">Picking</option>
          <option value="Packed">Packed</option>
          <option value="Dispatched">Dispatched</option>
          <option value="Delivered">Delivered</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Channel / Source</th>
                <th className="py-3 px-4">Customer & Contact</th>
                <th className="py-3 px-4">Items Summary</th>
                <th className="py-3 px-4">Fulfillment Method</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => {
                const totalUnits = order.items.reduce((s, i) => s + i.quantity, 0);

                return (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-bold text-slate-900 text-xs">{order.orderNumber}</p>
                      <p className="text-[11px] text-slate-400">{new Date(order.createdAt).toLocaleString()}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          order.source === 'POS'
                            ? 'bg-blue-100 text-blue-800'
                            : order.source === 'ECOMMERCE'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {order.source === 'POS' && <Monitor className="w-3 h-3" />}
                        {order.source === 'ECOMMERCE' && <Globe className="w-3 h-3" />}
                        {order.source === 'WHOLESALE' && <Building2 className="w-3 h-3" />}
                        <span>{order.channel}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{order.customerName || 'Walk-in Retail'}</p>
                      <p className="text-xs text-slate-500">{order.customerEmail || 'POS In-Store'}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      <p className="line-clamp-1 font-medium">{order.items[0]?.productName} {order.items.length > 1 ? `+${order.items.length - 1} more` : ''}</p>
                      <p className="text-xs text-slate-400">{totalUnits} total units</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="flex items-center gap-1.5 text-xs">
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        <span>{order.fulfillmentMethod}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono">
                      {formatCurrency(order.totalAmount)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-block ${
                          order.status === 'Completed' || order.status === 'Delivered'
                            ? 'bg-emerald-100 text-emerald-700'
                            : order.status === 'Dispatched'
                            ? 'bg-blue-100 text-blue-700'
                            : order.status === 'Picking' || order.status === 'Packed'
                            ? 'bg-amber-100 text-amber-800'
                            : order.status === 'Stock Reserved' || order.status === 'Pending'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-blue-600 hover:text-blue-700 rounded-lg text-xs font-semibold transition-colors border border-slate-200"
                      >
                        View & Fulfill
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ORDER FULFILLMENT MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 text-slate-900 max-h-[90vh] flex flex-col text-xs">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-base text-slate-900">Order {selectedOrder.orderNumber}</h3>
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] uppercase font-bold">
                    {selectedOrder.channel}
                  </span>
                </div>
                <p className="text-xs text-slate-500">Placed on {new Date(selectedOrder.createdAt).toLocaleString()}</p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 font-medium"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Packing Slip</span>
                </button>
                <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
              {/* Customer & Delivery Card */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Customer Details</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedOrder.customerName || 'Walk-in'}</p>
                  <p className="text-slate-600">{selectedOrder.customerEmail}</p>
                  <p className="text-slate-600">{selectedOrder.customerPhone}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Delivery Destination</p>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedOrder.fulfillmentMethod}</p>
                  {selectedOrder.shippingAddress && (
                    <p className="text-slate-600 leading-tight mt-0.5">
                      {selectedOrder.shippingAddress.street}, {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.zip}
                    </p>
                  )}
                  {selectedOrder.trackingNumber && (
                    <p className="text-blue-600 font-mono text-xs mt-1 font-bold">
                      Tracking: {selectedOrder.trackingNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <p className="font-bold uppercase tracking-wider text-[11px] text-slate-500">Ordered Items</p>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">{item.variantName} • SKU: {item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{item.quantity} × {formatCurrency(item.price)}</p>
                        <p className="text-xs text-emerald-700 font-semibold font-mono">{formatCurrency(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financials Breakdown */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium text-slate-900">{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Discount:</span>
                    <span className="font-mono">-{formatCurrency(selectedOrder.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Tax:</span>
                  <span className="font-mono font-medium text-slate-900">{formatCurrency(selectedOrder.taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span className="text-blue-600 font-mono">{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Fulfillment Actions */}
              <div className="space-y-3 pt-2">
                <p className="font-bold uppercase tracking-wider text-[11px] text-slate-500">Fulfillment Pipeline Actions</p>

                {(selectedOrder.status === 'Stock Reserved' || selectedOrder.status === 'Pending') && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'Picking')}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    <span>Begin Picking & Packing in Warehouse</span>
                  </button>
                )}

                {selectedOrder.status === 'Picking' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'Packed')}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    <span>Mark as Packed & Ready for Inbound/Dispatch</span>
                  </button>
                )}

                {selectedOrder.status === 'Packed' && (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <p className="font-bold text-slate-900 text-xs">Dispatch Shipment:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Carrier (e.g. FedEx / DHL)"
                        value={carrierName}
                        onChange={(e) => setCarrierName(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Tracking Number"
                        value={trackingNumberInput}
                        onChange={(e) => setTrackingNumberInput(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg p-2 text-slate-900 text-xs"
                      />
                    </div>
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'Dispatched')}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Truck className="w-4 h-4" />
                      <span>Mark as Dispatched & Issue Tracking</span>
                    </button>
                  </div>
                )}

                {selectedOrder.status === 'Dispatched' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'Delivered')}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Final Delivery / Customer Received</span>
                  </button>
                )}

                {selectedOrder.status !== 'Cancelled' && selectedOrder.status !== 'Completed' && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to cancel this order and restock goods?')) {
                        handleUpdateStatus(selectedOrder.id, 'Cancelled');
                      }
                    }}
                    className="w-full py-2 text-rose-600 hover:text-rose-700 font-semibold text-xs"
                  >
                    Cancel Order & Restock Inventory
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
