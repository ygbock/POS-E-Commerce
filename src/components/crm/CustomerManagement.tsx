import React, { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  X,
  Receipt,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Customer, CustomerTier } from '../../types';

export const CustomerManagement: React.FC = () => {
  const { customers, addCustomer, updateCustomer, formatCurrency, orders } = useCommerce();

  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<Customer | null>(null);

  // New Customer Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState<CustomerTier>('Bronze');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');

  const filteredCustomers = customers.filter((c) => {
    const matchesTier = tierFilter === 'All' || c.tier === tierFilter;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery);
    return matchesTier && matchesSearch;
  });

  const handleAddCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addCustomer({
      id: `cust-${Date.now()}`,
      name,
      email,
      phone,
      tier,
      loyaltyPoints: 100, // Welcome bonus points
      storeCreditBalance: 0,
      creditLimit: 500,
      totalSpent: 0,
      ordersCount: 0,
      customerGroup: 'Retail',
      registeredAt: new Date().toISOString(),
      addresses: street ? [{ id: 'addr_' + Date.now(), label: 'Home', street, city, zip, isDefault: true }] : [],
    });

    setIsAddCustomerOpen(false);
    setName('');
    setEmail('');
    setPhone('');
    setStreet('');
    setCity('');
    setZip('');
  };

  const handleAdjustPointsOrCredit = (customer: Customer) => {
    const action = prompt('Choose action:\n1: Add Loyalty Points\n2: Add Store Credit', '1');
    if (action === '1') {
      const pts = prompt('Enter points to add (or subtract with negative):', '50');
      if (pts !== null) {
        const delta = parseInt(pts, 10) || 0;
        updateCustomer({ ...customer, loyaltyPoints: Math.max(0, customer.loyaltyPoints + delta) });
      }
    } else if (action === '2') {
      const credit = prompt('Enter store credit amount to add ($):', '25.00');
      if (credit !== null) {
        const delta = parseFloat(credit) || 0;
        updateCustomer({ ...customer, storeCreditBalance: Math.max(0, customer.storeCreditBalance + delta) });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            <span>Customer Relationship & Loyalty CRM</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Unified omnichannel customer profiles, VIP discount tiers, loyalty points, and store credit ledger
          </p>
        </div>

        <button
          id="btn-add-new-customer"
          onClick={() => setIsAddCustomerOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm shadow-blue-200 flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Customer</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto custom-scrollbar w-full sm:w-auto">
          {(['All', 'VIP', 'Gold', 'Silver', 'Bronze'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tierFilter === t
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((cust) => {
          const custOrders = orders.filter((o) => o.customerId === cust.id || o.customerEmail === cust.email);

          return (
            <div
              key={cust.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-blue-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-tight">{cust.name}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Mail className="w-3 h-3 text-slate-400" />
                      <span>{cust.email}</span>
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{cust.phone}</span>
                    </p>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                      cust.tier === 'VIP'
                        ? 'bg-purple-100 text-purple-800'
                        : cust.tier === 'Gold'
                        ? 'bg-amber-100 text-amber-800'
                        : cust.tier === 'Silver'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {cust.tier} Tier
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-slate-100 text-center text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Total Spent</span>
                    <strong className="text-slate-900 font-bold font-mono text-xs">{formatCurrency(cust.totalSpent)}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Loyalty Pts</span>
                    <strong className="text-blue-700 font-bold text-xs">{cust.loyaltyPoints} pts</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Store Credit</span>
                    <strong className="text-emerald-700 font-bold font-mono text-xs">{formatCurrency(cust.storeCreditBalance)}</strong>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => setSelectedCustomerForHistory(cust)}
                  className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Order History ({custOrders.length})</span>
                </button>

                <button
                  onClick={() => handleAdjustPointsOrCredit(cust)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-medium border border-slate-200 shadow-xs transition-colors"
                >
                  Reward / Credit
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: Register Customer */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Register Omnichannel Customer</h3>
              </div>
              <button onClick={() => setIsAddCustomerOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomerSubmit} className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Full Name:</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. David Miller"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Customer Tier:</label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value as CustomerTier)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  >
                    <option value="Bronze">Bronze (0% discount)</option>
                    <option value="Silver">Silver (5% discount)</option>
                    <option value="Gold">Gold (10% discount)</option>
                    <option value="VIP">VIP (Member pricing)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Email Address:</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="david@example.com"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Phone Number:</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Street Address:</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">City:</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Zip / Postal Code:</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="90001"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Save Customer & Issue 100 Welcome Pts
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Customer Order History */}
      {selectedCustomerForHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-base text-slate-900">{selectedCustomerForHistory.name}'s Order History</h3>
                <p className="text-xs text-slate-500">{selectedCustomerForHistory.email}</p>
              </div>
              <button onClick={() => setSelectedCustomerForHistory(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 max-h-72 overflow-y-auto custom-scrollbar">
              {orders
                .filter(
                  (o) =>
                    o.customerId === selectedCustomerForHistory.id ||
                    o.customerEmail === selectedCustomerForHistory.email ||
                    o.customerName === selectedCustomerForHistory.name
                )
                .map((ord) => (
                  <div key={ord.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{ord.orderNumber} ({ord.channel})</p>
                      <p className="text-xs text-slate-500">{new Date(ord.createdAt).toLocaleDateString()} • {ord.items.length} line items</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold font-mono text-slate-900 block">{formatCurrency(ord.totalAmount)}</span>
                      <span className="text-xs text-blue-700 font-semibold">{ord.status}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
