import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertCircle,
  Activity,
  ArrowRight,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { authClient } from '../../services/authClient';
import { PlatformDiscoveryLocationsView } from './PlatformDiscoveryLocationsView';

interface CategoryRecord {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  display_order: number;
  is_active: boolean;
  is_system: boolean;
  published_business_count?: number;
  created_at?: string;
  updated_at?: string;
}

export const PlatformDiscoveryCategoriesView: React.FC = () => {
  const [activeGovernanceTab, setActiveGovernanceTab] = useState<'categories' | 'locations'>('categories');
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Tree toggle states: Map of parentId -> boolean
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setSelectedCategory] = useState<CategoryRecord | null>(null); // Null means creating
  const [formSubmitting, setFormSaving] = useState(false);

  // Form inputs
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIconName, setFormIconName] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formDisplayOrder, setFormDisplayOrder] = useState('0');
  const [formIsActive, setFormIsActive] = useState(true);

  // Auto-generate slug toggle
  const [autoSlug, setAutoSlug] = useState(true);

  // Load all platform categories (with counts)
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/discovery/categories', {
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || `Failed to fetch categories (${response.status})`);
      }
      const data = (body.data || []) as CategoryRecord[];
      setCategories(data);

      // Auto-expand all parents with children by default
      const parentIds = data.filter((c) => !c.parent_id).map((c) => c.id);
      setExpandedParents((prev) => {
        const next = { ...prev };
        parentIds.forEach((id) => {
          if (next[id] === undefined) {
            next[id] = true;
          }
        });
        return next;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load category taxonomy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  // Sync slug with name if auto-slug is enabled (and not editing an existing category slug)
  useEffect(() => {
    if (autoSlug && !editingCategory) {
      const generated = formName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormSlug(generated);
    }
  }, [formName, autoSlug, editingCategory]);

  // Open modal for Creating new category / subcategory
  const handleOpenCreate = (parentId?: string) => {
    setSelectedCategory(null);
    setFormName('');
    setFormSlug('');
    setFormDescription('');
    setFormIconName('');
    setFormParentId(parentId || '');
    setFormDisplayOrder('0');
    setFormIsActive(true);
    setAutoSlug(true);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  // Open modal for Editing category / subcategory
  const handleOpenEdit = (cat: CategoryRecord) => {
    setSelectedCategory(cat);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormDescription(cat.description || '');
    setFormIconName(cat.icon_name || '');
    setFormParentId(cat.parent_id || '');
    setFormDisplayOrder(String(cat.display_order));
    setFormIsActive(cat.is_active);
    setAutoSlug(false);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  // Submit Category Create or Update
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Category name is required.');
      return;
    }
    if (!formSlug.trim()) {
      setError('Category slug is required.');
      return;
    }
    // Slug validation regex
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formSlug)) {
      setError('Slug must contain lowercase letters, numbers, and hyphens only.');
      return;
    }

    setFormSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      name: formName.trim(),
      slug: formSlug.trim(),
      description: formDescription.trim() || null,
      iconName: formIconName.trim() || null,
      parentId: formParentId || null,
      displayOrder: parseInt(formDisplayOrder, 10) || 0,
      isActive: formIsActive,
    };

    try {
      const url = editingCategory
        ? `/api/platform/discovery/categories/${editingCategory.id}`
        : '/api/platform/discovery/categories';
      const method = editingCategory ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || `Operation failed (${response.status})`);
      }

      setSuccess(
        editingCategory
          ? `Category "${formName}" updated successfully.`
          : `Category "${formName}" created successfully.`
      );
      setIsModalOpen(false);
      void fetchCategories();
    } catch (err: any) {
      setError(err?.message || 'Failed to save category.');
    } finally {
      setFormSaving(false);
    }
  };

  // Toggle IsActive status directly from tree
  const handleToggleActive = async (cat: CategoryRecord) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const nextState = !cat.is_active;
    try {
      const response = await fetch(`/api/platform/discovery/categories/${cat.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
        body: JSON.stringify({
          isActive: nextState,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || `Failed to update status`);
      }

      setSuccess(`Category "${cat.name}" has been ${nextState ? 'activated' : 'deactivated'}.`);
      void fetchCategories();
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle status.');
      setLoading(false);
    }
  };

  // Process and hierarchy categorization
  const categoryTree = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id);
    const childrenByParent = new Map<string, CategoryRecord[]>();

    categories.forEach((c) => {
      if (c.parent_id) {
        const list = childrenByParent.get(c.parent_id) || [];
        list.push(c);
        childrenByParent.set(c.parent_id, list);
      }
    });

    const searchLower = searchQuery.toLowerCase().trim();

    return parents
      .map((p) => {
        const subs = childrenByParent.get(p.id) || [];
        // Apply search query
        const pMatches =
          p.name.toLowerCase().includes(searchLower) ||
          p.slug.toLowerCase().includes(searchLower) ||
          (p.description && p.description.toLowerCase().includes(searchLower));

        const filteredSubs = subs.filter(
          (s) =>
            s.name.toLowerCase().includes(searchLower) ||
            s.slug.toLowerCase().includes(searchLower) ||
            (s.description && s.description.toLowerCase().includes(searchLower))
        );

        const hasSubMatches = filteredSubs.length > 0;

        return {
          parent: p,
          subcategories: subs,
          filteredSubcategories: filteredSubs,
          visible: !searchLower || pMatches || hasSubMatches,
        };
      })
      .filter((node) => node.visible);
  }, [categories, searchQuery]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = categories.length;
    const parents = categories.filter((c) => !c.parent_id).length;
    const subs = categories.filter((c) => c.parent_id).length;
    const active = categories.filter((c) => c.is_active).length;
    const inactive = categories.filter((c) => !c.is_active).length;
    const totalBusinesses = categories.reduce((sum, c) => sum + (c.published_business_count || 0), 0);

    return {
      total,
      parents,
      subs,
      active,
      inactive,
      totalBusinesses,
    };
  }, [categories]);

  const toggleParentExpand = (parentId: string) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Governance Sub-Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveGovernanceTab('categories')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeGovernanceTab === 'categories'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Category Taxonomy</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                activeGovernanceTab === 'categories'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {stats.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveGovernanceTab('locations')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeGovernanceTab === 'locations'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Search Locations (Regions, Districts & Cities)</span>
          </button>
        </div>

        <a
          href="/discover"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
        >
          <span>Preview Discovery Page</span>
          <ExternalLink className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        </a>
      </div>

      {activeGovernanceTab === 'locations' ? (
        <PlatformDiscoveryLocationsView />
      ) : (
        <>
          {/* Module Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Layers className="w-3.5 h-3.5 text-indigo-300" />
                Discovery Control Panel
              </span>
              <span className="text-xs text-indigo-400 font-mono">Hierarchy Level: 2-Tier Taxonomies</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              Discovery Category Governance
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Platform-authoritative taxonomy control plane. Safely provision, restructure, and deactivate public category taxonomy mapping node paths.
            </p>
          </div>
          <div>
            <button
              onClick={() => handleOpenCreate()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Top Category
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Categories
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">{stats.total}</span>
            <span className="text-xs text-slate-500">nodes</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Parents (Level 1)
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">{stats.parents}</span>
            <span className="text-xs text-slate-500">root tags</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Subcategories
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">{stats.subs}</span>
            <span className="text-xs text-slate-500">children</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Taxonomy Health
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{stats.active}</span>
            <span className="text-xs text-slate-400">/ {stats.inactive} inactive</span>
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Listings Maps
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {stats.totalBusinesses}
            </span>
            <span className="text-xs text-slate-400">associations</span>
          </div>
        </div>
      </div>

      {/* Success / Error Feedback */}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-semibold">{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/40 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search categories, subcategories, slugs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={() => void fetchCategories()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            title="Refresh Taxonomy"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <span className="text-xs text-slate-400 font-medium">
            Showing {categoryTree.length} parent nodes
          </span>
        </div>
      </div>

      {/* Category Management Taxonomy Tree Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/40 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-5">Taxonomy Node Name</th>
                <th className="py-3 px-4">System Slug</th>
                <th className="py-3 px-4">Icon Name</th>
                <th className="py-3 px-4 text-center">Display Order</th>
                <th className="py-3 px-4 text-center">Active Listings</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-5 text-right">Actions Control</th>
              </tr>
            </thead>
            <tbody>
              {loading && categories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                      <p className="text-xs font-bold text-slate-500">Loading platform categories...</p>
                    </div>
                  </td>
                </tr>
              ) : categoryTree.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500 text-xs font-semibold">
                    No taxonomy categories matching search parameters.
                  </td>
                </tr>
              ) : (
                categoryTree.map(({ parent: p, subcategories, filteredSubcategories }) => {
                  const isExpanded = expandedParents[p.id] !== false;
                  const hasChildren = subcategories.length > 0;
                  const displaySubcategories = searchQuery ? filteredSubcategories : subcategories;

                  return (
                    <React.Fragment key={p.id}>
                      {/* Parent Row */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800 font-semibold group">
                        <td className="py-3.5 px-5 flex items-center gap-2.5">
                          {hasChildren ? (
                            <button
                              onClick={() => toggleParentExpand(p.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <div className="w-6" />
                          )}
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            {p.icon_name ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {p.name}
                              {p.is_system && (
                                <span className="text-[9px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 px-1 rounded">
                                  System
                                </span>
                              )}
                            </div>
                            {p.description && (
                              <p className="text-[10px] text-slate-400 max-w-sm truncate mt-0.5">
                                {p.description}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {p.slug}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                          {p.icon_name || <span className="text-slate-400">-</span>}
                        </td>

                        <td className="py-3.5 px-4 text-center text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                          {p.display_order}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {p.published_business_count || 0}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleToggleActive(p)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all select-none cursor-pointer border ${
                              p.is_active
                                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40 hover:bg-emerald-100'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {p.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            <span>{p.is_active ? 'Active' : 'Disabled'}</span>
                          </button>
                        </td>

                        <td className="py-3.5 px-5 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenCreate(p.id)}
                              className="p-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg cursor-pointer flex items-center gap-1"
                              title="Add subcategory"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Sub</span>
                            </button>
                            <button
                              onClick={() => handleOpenEdit(p)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                              title="Edit Node"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Subcategory Row lists */}
                      {isExpanded &&
                        displaySubcategories.map((sub) => (
                          <tr
                            key={sub.id}
                            className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800/60 text-xs font-medium text-slate-600 dark:text-slate-300 group bg-slate-50/20 dark:bg-slate-900/10"
                          >
                            <td className="py-2.5 pl-14 pr-5 flex items-center gap-2">
                              <div className="flex items-center text-slate-300 select-none mr-1">
                                <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                              </div>
                              <div className="w-7 h-7 rounded-lg bg-indigo-500/5 text-indigo-500/80 flex items-center justify-center shrink-0">
                                <Layers className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                  {sub.name}
                                </div>
                                {sub.description && (
                                  <p className="text-[10px] text-slate-400 max-w-sm truncate">
                                    {sub.description}
                                  </p>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 px-4 font-mono text-[10px] text-slate-500">
                              {sub.slug}
                            </td>

                            <td className="py-2.5 px-4 text-xs italic text-slate-400">
                              {sub.icon_name || <span className="text-slate-300">-</span>}
                            </td>

                            <td className="py-2.5 px-4 text-center text-xs font-mono text-slate-500">
                              {sub.display_order}
                            </td>

                            <td className="py-2.5 px-4 text-center">
                              <span className="inline-flex px-1.5 py-0.2 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                                {sub.published_business_count || 0}
                              </span>
                            </td>

                            <td className="py-2.5 px-4 text-center">
                              <button
                                onClick={() => handleToggleActive(sub)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase transition-all select-none cursor-pointer border ${
                                  sub.is_active
                                    ? 'bg-emerald-50/70 dark:bg-emerald-950/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/40 hover:bg-emerald-100'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {sub.is_active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                                <span>{sub.is_active ? 'Active' : 'Disabled'}</span>
                              </button>
                            </td>

                            <td className="py-2.5 px-5 text-right">
                              <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleOpenEdit(sub)}
                                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                                  title="Edit Node"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation / Editing Modal Popover */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {editingCategory ? 'Edit Taxonomy Node' : 'Create Taxonomy Node'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {editingCategory
                    ? `Modifying assigned parameters of: "${editingCategory.name}"`
                    : 'Provisioning a new category node mapping path'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {/* Category Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hardware & Materials"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Category Slug */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    System URL Slug
                  </label>
                  {!editingCategory && (
                    <button
                      type="button"
                      onClick={() => setAutoSlug((prev) => !prev)}
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded transition-all border ${
                        autoSlug
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {autoSlug ? 'Auto-Sync' : 'Manual Edit'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="e.g. hardware-materials"
                  required
                  disabled={autoSlug && !editingCategory}
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                />
                <p className="text-[10px] text-slate-400">
                  Lowercases, numbers, and hyphens only. Establish canonical SEO routing paths.
                </p>
              </div>

              {/* Category Hierarchy Parent Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Hierarchy Parent Path
                </label>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">No Parent (Treat as Level 1 Root Category)</option>
                  {categories
                    .filter((c) => !c.parent_id && c.id !== editingCategory?.id)
                    .map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        Parent: {parent.name}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  Assign this node inside the taxonomy hierarchy map grid.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Icon Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Icon Name Identifier
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ShoppingBag, Wrench"
                    value={formIconName}
                    onChange={(e) => setFormIconName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Display Order */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Display Sorting Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    required
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {/* Category Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Taxonomy Node Description
                </label>
                <textarea
                  placeholder="Describe kinds of listings mapped under this category taxonomy..."
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Status active switch */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <input
                  type="checkbox"
                  id="formIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="formIsActive" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Category node active & discoverable for merchants
                </label>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingCategory ? 'Save Changes' : 'Create Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
