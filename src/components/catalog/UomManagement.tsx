import React, { useState } from 'react';
import {
  Ruler,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Scale,
  Boxes,
  Percent,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { UnitOfMeasurement } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

export const UomManagement: React.FC = () => {
  const { unitsOfMeasurement, addUnit, updateUnit, deleteUnit, products } = useCommerce();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasurement | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<UnitOfMeasurement['category']>('Count');
  const [allowFractional, setAllowFractional] = useState(false);
  const [baseUnitCode, setBaseUnitCode] = useState('');
  const [conversionFactor, setConversionFactor] = useState<number | undefined>(undefined);

  const filteredUnits = unitsOfMeasurement.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingUnit(null);
    setCode('');
    setName('');
    setCategory('Count');
    setAllowFractional(false);
    setBaseUnitCode('');
    setConversionFactor(undefined);
    setIsModalOpen(true);
  };

  const openEditModal = (u: UnitOfMeasurement) => {
    setEditingUnit(u);
    setCode(u.code);
    setName(u.name);
    setCategory(u.category);
    setAllowFractional(u.allowFractional);
    setBaseUnitCode(u.baseUnitCode || '');
    setConversionFactor(u.conversionFactor);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUnit) {
      updateUnit({
        ...editingUnit,
        code: code.trim().toLowerCase(),
        name,
        category,
        allowFractional,
        baseUnitCode: baseUnitCode ? baseUnitCode.trim().toLowerCase() : undefined,
        conversionFactor: conversionFactor ? Number(conversionFactor) : undefined,
      });
    } else {
      const newUnit: UnitOfMeasurement = {
        id: `uom-${Date.now().toString(36)}`,
        code: code.trim().toLowerCase(),
        name,
        category,
        allowFractional,
        baseUnitCode: baseUnitCode ? baseUnitCode.trim().toLowerCase() : undefined,
        conversionFactor: conversionFactor ? Number(conversionFactor) : undefined,
      };
      addUnit(newUnit);
    }
    setIsModalOpen(false);
  };

  const getProductCountForUom = (uomCode: string) => {
    return products.filter((p) => (p.unit || 'pcs').toLowerCase() === uomCode.toLowerCase()).length;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Units of Measurement (UOM)</h2>
              <p className="text-xs text-slate-500">
                Configure weight, packaging conversions, piece counts, and fractional decimals
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search units (kg, pcs, box)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-200 transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit</span>
          </button>
        </div>
      </div>

      {/* Table of UOMs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Unit Code</th>
                <th className="py-3 px-4">Unit Name</th>
                <th className="py-3 px-4">Type / Category</th>
                <th className="py-3 px-4">Fractional / Decimal</th>
                <th className="py-3 px-4">Base Unit & Ratio</th>
                <th className="py-3 px-4">Catalog Items</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUnits.map((uom) => {
                const prodCount = getProductCountForUom(uom.code);
                return (
                  <tr key={uom.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {uom.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{uom.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        {uom.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {uom.allowFractional ? (
                        <span className="flex items-center gap-1 text-emerald-700 font-medium">
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> Allowed (e.g. 1.25 kg)
                        </span>
                      ) : (
                        <span className="text-slate-400">Integer only (Whole)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {uom.baseUnitCode && uom.conversionFactor ? (
                        <span>
                          1 {uom.code} = {uom.conversionFactor} {uom.baseUnitCode}
                        </span>
                      ) : (
                        <span className="text-slate-400">Base Unit</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-700">{prodCount} products</span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => openEditModal(uom)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        title="Edit Unit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete unit "${uom.name}" (${uom.code})?`)) {
                            deleteUnit(uom.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Unit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-900 flex flex-col my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingUnit ? 'Edit Unit of Measurement' : 'Add Unit of Measurement'}
                  </h3>
                  <p className="text-xs text-slate-500">Specify symbol, conversion ratio, and decimals</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. box, carton, kg, pcs"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Carton (24 pcs)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category Type</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="Count">Count / Pieces</option>
                  <option value="Weight">Weight (kg, g, lb, oz)</option>
                  <option value="Volume">Volume (L, ml, gal)</option>
                  <option value="Length">Length (m, cm, ft)</option>
                  <option value="Packaging">Packaging Container (Box, Pack, Carton)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base Unit (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. pcs, kg"
                    value={baseUnitCode}
                    onChange={(e) => setBaseUnitCode(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Conversion Multiplier
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 12 or 0.001"
                    value={conversionFactor ?? ''}
                    onChange={(e) => setConversionFactor(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={allowFractional}
                    onChange={(e) => setAllowFractional(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Allow Fractional Quantities</span>
                    <span className="text-[11px] text-slate-500">
                      Enables cashier to sell partial amounts (e.g. 0.450 kg coffee beans or 2.5 meters cable)
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-200 flex items-center space-x-2 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingUnit ? 'Update Unit' : 'Save Unit'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
