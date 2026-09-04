import React, { useState } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Layers,
  Smartphone,
  Search,
  Sparkles,
  ChevronRight,
  Coffee,
  Headphones,
  Shirt,
  UtensilsCrossed,
  Cpu,
  PackagePlus,
  ShoppingBag,
} from 'lucide-react';
import { Category } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

const ICON_OPTIONS = [
  { name: 'Headphones', icon: Headphones },
  { name: 'Coffee', icon: Coffee },
  { name: 'Shirt', icon: Shirt },
  { name: 'UtensilsCrossed', icon: UtensilsCrossed },
  { name: 'Cpu', icon: Cpu },
  { name: 'PackagePlus', icon: PackagePlus },
  { name: 'ShoppingBag', icon: ShoppingBag },
  { name: 'FolderTree', icon: FolderTree },
];

export const CategoryManagement: React.FC = () => {
  const { categories, addCategory, updateCategory, deleteCategory, products } = useCommerce();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [iconName, setIconName] = useState('FolderTree');
  const [accentColor, setAccentColor] = useState('#38bdf8');
  const [subcategoriesInput, setSubcategoriesInput] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number>(1);
  const [isPosQuickAccess, setIsPosQuickAccess] = useState(true);

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.subcategories.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setSlug('');
    setDescription('');
    setIconName('FolderTree');
    setAccentColor('#38bdf8');
    setSubcategoriesInput('');
    setDisplayOrder(categories.length + 1);
    setIsPosQuickAccess(true);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setIconName(cat.iconName || 'FolderTree');
    setAccentColor(cat.accentColor || '#38bdf8');
    setSubcategoriesInput(cat.subcategories.join(', '));
    setDisplayOrder(cat.displayOrder || 1);
    setIsPosQuickAccess(cat.isPosQuickAccess ?? true);
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCategory) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const subs = subcategoriesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingCategory) {
      updateCategory({
        ...editingCategory,
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        iconName,
        accentColor,
        subcategories: subs,
        displayOrder,
        isPosQuickAccess,
      });
    } else {
      const newCat: Category = {
        id: `cat-${Date.now().toString(36)}`,
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description,
        iconName,
        accentColor,
        subcategories: subs,
        displayOrder,
        isPosQuickAccess,
      };
      addCategory(newCat);
    }
    setIsModalOpen(false);
  };

  const getProductCountForCategory = (catName: string) => {
    return products.filter((p) => p.category.toLowerCase() === catName.toLowerCase()).length;
  };

  const renderIcon = (name?: string, className = 'w-5 h-5') => {
    const found = ICON_OPTIONS.find((item) => item.name === name);
    const IconComp = found ? found.icon : FolderTree;
    return <IconComp className={className} />;
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Product Categories & Subcategories</h2>
              <p className="text-xs text-slate-500">
                Hierarchical taxonomy shared between POS registers and online storefront
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search category or subcategory..."
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
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCategories.map((cat) => {
          const prodCount = getProductCountForCategory(cat.name);
          return (
            <div
              key={cat.id}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all flex flex-col justify-between group shadow-sm"
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center border shadow-xs"
                      style={{
                        backgroundColor: `${cat.accentColor || '#38bdf8'}15`,
                        borderColor: `${cat.accentColor || '#38bdf8'}30`,
                        color: cat.accentColor || '#0284c7',
                      }}
                    >
                      {renderIcon(cat.iconName, 'w-6 h-6')}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                        {cat.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono">/{cat.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openEditModal(cat)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
                          deleteCategory(cat.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {cat.description && (
                  <p className="text-xs text-slate-600 mb-4 line-clamp-2 leading-relaxed">
                    {cat.description}
                  </p>
                )}

                {/* Subcategories tags */}
                <div className="space-y-1.5 mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Subcategories ({cat.subcategories.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.subcategories.map((sub) => (
                      <span
                        key={sub}
                        className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-medium"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer info & flags */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                    {prodCount} {prodCount === 1 ? 'Product' : 'Products'}
                  </span>
                  <span className="text-[11px] text-slate-400">Order: #{cat.displayOrder}</span>
                </div>

                {cat.isPosQuickAccess && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <Smartphone className="w-3 h-3" /> POS Fast Tile
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-900 flex flex-col my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingCategory ? 'Edit Category' : 'Create New Category'}
                  </h3>
                  <p className="text-xs text-slate-500">Configure category taxonomy and POS display</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Smart Wearables"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">URL Slug *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. smart-wearables"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Summary of products in this category..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subcategories (comma-separated) *
                </label>
                <input
                  type="text"
                  placeholder="Smartwatches, Fitness Trackers, Straps, Chargers"
                  value={subcategoriesInput}
                  onChange={(e) => setSubcategoriesInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Separate nested subcategories with commas to automatically index product filters.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Accent Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-10 h-9 bg-slate-50 border border-slate-200 rounded-lg p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Icon Style</label>
                  <select
                    value={iconName}
                    onChange={(e) => setIconName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  >
                    {ICON_OPTIONS.map((opt) => (
                      <option key={opt.name} value={opt.name}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={isPosQuickAccess}
                    onChange={(e) => setIsPosQuickAccess(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Enable POS Quick-Access Tile</span>
                    <span className="text-[11px] text-slate-500">
                      Show this category as a prominent quick-filter pill in the Cashier POS interface
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
                  <span>{editingCategory ? 'Update Category' : 'Save Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
