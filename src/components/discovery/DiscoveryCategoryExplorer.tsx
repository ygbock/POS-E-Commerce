import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Utensils,
  Smartphone,
  Shirt,
  Sparkles,
  Wrench,
  HeartPulse,
  Home,
  Car,
  Layers,
  ChevronDown,
  ChevronRight,
  Check,
  BriefcaseBusiness,
  Coffee,
} from 'lucide-react';
import type { DiscoveryCategory } from '../../types/discovery';

interface DiscoveryCategoryExplorerProps {
  categories: DiscoveryCategory[];
  selectedCategoryId?: string;
  onSelectCategory: (categoryId: string) => void;
  isLoading?: boolean;
  className?: string;
}

// Fallback curated subcategories in case the database only returns top-level categories
const FALLBACK_SUBCATEGORIES: Record<string, Array<{ id: string; name: string; slug: string }>> = {
  'retail': [
    { id: 'disc_cat_retail_supermarkets', name: 'Supermarkets & Groceries', slug: 'supermarkets-groceries' },
    { id: 'disc_cat_retail_general', name: 'General Merchandise', slug: 'general-merchandise' },
    { id: 'disc_cat_retail_stationery', name: 'Books, Office & Stationery', slug: 'books-office-stationery' },
    { id: 'disc_cat_retail_wholesale', name: 'Wholesale & Distribution', slug: 'wholesale-distribution' },
  ],
  'food-dining': [
    { id: 'disc_cat_food_restaurants', name: 'Restaurants & Local Dining', slug: 'restaurants-local-dining' },
    { id: 'disc_cat_food_fast_food', name: 'Fast Food & Takeaway', slug: 'fast-food-takeaway' },
    { id: 'disc_cat_food_bakery', name: 'Bakeries, Cafes & Pastries', slug: 'bakeries-cafes-pastries' },
    { id: 'disc_cat_food_catering', name: 'Catering & Event Food', slug: 'catering-event-food' },
  ],
  'services': [
    { id: 'disc_cat_services_laundry', name: 'Laundry & Dry Cleaning', slug: 'laundry-dry-cleaning' },
    { id: 'disc_cat_services_logistics', name: 'Delivery, Courier & Logistics', slug: 'delivery-courier-logistics' },
    { id: 'disc_cat_services_events', name: 'Events, Photography & Media', slug: 'events-photography-media' },
    { id: 'disc_cat_services_tailoring', name: 'Tailoring & Alterations', slug: 'tailoring-alterations' },
  ],
  'automotive': [
    { id: 'disc_cat_auto_repair', name: 'Auto Repair & Mechanics', slug: 'auto-repair-mechanics' },
    { id: 'disc_cat_auto_parts', name: 'Spare Parts & Accessories', slug: 'spare-parts-accessories' },
    { id: 'disc_cat_auto_wash', name: 'Car Wash & Detailing', slug: 'car-wash-detailing' },
    { id: 'disc_cat_auto_rentals', name: 'Vehicle Sales & Rentals', slug: 'vehicle-sales-rentals' },
  ],
  'electronics-technology': [
    { id: 'disc_cat_elec_phones', name: 'Phones, Tablets & Accessories', slug: 'phones-tablets-accessories' },
    { id: 'disc_cat_elec_computers', name: 'Computers, Laptops & Networking', slug: 'computers-laptops-networking' },
    { id: 'disc_cat_elec_appliances', name: 'Home Appliances & Solar', slug: 'home-appliances-solar' },
    { id: 'disc_cat_elec_repair', name: 'Phone & Computer Repair', slug: 'phone-computer-repair' },
  ],
  'health-wellness': [
    { id: 'disc_cat_health_pharmacy', name: 'Pharmacies & Medical Supplies', slug: 'pharmacies-medical-supplies' },
    { id: 'disc_cat_health_clinics', name: 'Clinics, Labs & Diagnostics', slug: 'clinics-labs-diagnostics' },
    { id: 'disc_cat_health_fitness', name: 'Fitness, Gyms & Wellness', slug: 'fitness-gyms-wellness' },
  ],
  'fashion-beauty': [
    { id: 'disc_cat_fashion_clothing', name: 'Clothing, Africana & Boutiques', slug: 'clothing-africana-boutiques' },
    { id: 'disc_cat_fashion_shoes', name: 'Shoes, Bags & Jewelry', slug: 'shoes-bags-jewelry' },
    { id: 'disc_cat_fashion_salon', name: 'Hair Salons & Barbershops', slug: 'hair-salons-barbershops' },
    { id: 'disc_cat_fashion_cosmetics', name: 'Cosmetics, Skincare & Perfumes', slug: 'cosmetics-skincare-perfumes' },
  ],
  'home-construction': [
    { id: 'disc_cat_home_hardware', name: 'Hardware & Building Materials', slug: 'hardware-building-materials' },
    { id: 'disc_cat_home_furniture', name: 'Furniture, Decor & Bedding', slug: 'furniture-decor-bedding' },
    { id: 'disc_cat_home_plumbing_elec', name: 'Plumbing, Electrical & AC', slug: 'plumbing-electrical-ac' },
    { id: 'disc_cat_home_cleaning', name: 'Cleaning, Pest Control & Security', slug: 'cleaning-pest-control-security' },
  ],
  'professional-services': [
    { id: 'disc_cat_prof_legal_finance', name: 'Accounting, Legal & Consulting', slug: 'accounting-legal-consulting' },
    { id: 'disc_cat_prof_printing', name: 'Printing, Branding & Signage', slug: 'printing-branding-signage' },
    { id: 'disc_cat_prof_it_web', name: 'Software, Web & Digital Marketing', slug: 'software-web-digital-marketing' },
    { id: 'disc_cat_prof_education', name: 'Training, Tutoring & Education', slug: 'training-tutoring-education' },
  ],
};

// Map slugs or names to appropriate Lucide icons
const getCategoryIcon = (slugOrName: string) => {
  const s = slugOrName.toLowerCase();
  if (s.includes('food') || s.includes('restaurant') || s.includes('dining')) return Utensils;
  if (s.includes('tech') || s.includes('electronic') || s.includes('phone')) return Smartphone;
  if (s.includes('fashion') || s.includes('cloth') || s.includes('apparel')) return Shirt;
  if (s.includes('health') || s.includes('pharmacy') || s.includes('medical')) return HeartPulse;
  if (s.includes('beauty') || s.includes('salon') || s.includes('barber')) return Sparkles;
  if (s.includes('home') || s.includes('furniture') || s.includes('construction') || s.includes('garden')) return Home;
  if (s.includes('auto') || s.includes('car') || s.includes('mechanic')) return Car;
  if (s.includes('professional') || s.includes('consult') || s.includes('legal')) return BriefcaseBusiness;
  if (s.includes('repair') || s.includes('plumb') || s.includes('service')) return Wrench;
  if (s.includes('retail') || s.includes('grocery') || s.includes('market') || s.includes('supermarket')) return ShoppingBag;
  if (s.includes('cafe') || s.includes('drink') || s.includes('bakery')) return Coffee;
  return Layers;
};

export const DiscoveryCategoryExplorer: React.FC<DiscoveryCategoryExplorerProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  isLoading = false,
  className = '',
}) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Group categories into top-level parents and their subcategories
  const categoryTree = useMemo(() => {
    if (!categories || categories.length === 0) return [];

    const parents = categories.filter((c) => !c.parent_id);
    const childrenByParent = new Map<string, DiscoveryCategory[]>();

    categories.forEach((c) => {
      if (c.parent_id) {
        const list = childrenByParent.get(c.parent_id) || [];
        list.push(c);
        childrenByParent.set(c.parent_id, list);
      }
    });

    // If all categories had parent_id (unexpected), fallback to treating all as parents
    const baseParents = parents.length > 0 ? parents : categories;

    return baseParents.map((parent) => {
      const dbChildren = childrenByParent.get(parent.id) || [];
      let subcategories: DiscoveryCategory[] = dbChildren;

      if (subcategories.length === 0 && FALLBACK_SUBCATEGORIES[parent.slug]) {
        subcategories = FALLBACK_SUBCATEGORIES[parent.slug].map((sub, idx) => ({
          id: sub.id,
          parent_id: parent.id,
          name: sub.name,
          slug: sub.slug,
          display_order: parent.display_order + idx + 1,
          is_active: true,
        }));
      }

      return {
        parent,
        subcategories,
      };
    });
  }, [categories]);

  // Identify selected category or subcategory name for badge/clear control
  const selectedCategoryInfo = useMemo(() => {
    if (!selectedCategoryId) return null;
    for (const node of categoryTree) {
      if (node.parent.id === selectedCategoryId) {
        return { parent: node.parent, subcategory: null };
      }
      const matchedSub = node.subcategories.find((s) => s.id === selectedCategoryId);
      if (matchedSub) {
        return { parent: node.parent, subcategory: matchedSub };
      }
    }
    const direct = categories.find((c) => c.id === selectedCategoryId);
    return direct ? { parent: direct, subcategory: null } : null;
  }, [selectedCategoryId, categoryTree, categories]);

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!categoryTree || categoryTree.length === 0) {
    return null;
  }

  return (
    <section
      ref={containerRef}
      className={`space-y-3.5 sm:space-y-4 ${className}`}
      aria-labelledby="category-explorer-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 id="category-explorer-heading" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
            Explore by Category
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select a category card to open its subcategories dropdown or filter listings
          </p>
        </div>

        {selectedCategoryId && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {selectedCategoryInfo && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60">
                <span>{selectedCategoryInfo.parent.name}</span>
                {selectedCategoryInfo.subcategory && (
                  <>
                    <ChevronRight className="w-3 h-3 opacity-60" />
                    <span className="font-bold">{selectedCategoryInfo.subcategory.name}</span>
                  </>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                onSelectCategory('');
                setOpenDropdownId(null);
              }}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline min-h-[36px] px-1 flex items-center cursor-pointer"
            >
              Clear category
            </button>
          </div>
        )}
      </div>

      {/* Grid of Category dropdown cards: 2 cols on mobile, 3 on sm tablet, 4 on md tablet, 5-6 on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {categoryTree.map(({ parent: cat, subcategories }) => {
          const Icon = getCategoryIcon(cat.slug || cat.name);
          const isOpen = openDropdownId === cat.id;
          const activeSubcategory = subcategories.find((sub) => sub.id === selectedCategoryId);
          const isParentSelected = selectedCategoryId === cat.id;
          const isSelectedOrHasActiveChild = isParentSelected || Boolean(activeSubcategory);

          return (
            <div key={cat.id} className="relative">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => {
                  if (subcategories.length > 0) {
                    setOpenDropdownId((prev) => (prev === cat.id ? null : cat.id));
                  } else {
                    onSelectCategory(cat.id);
                    setOpenDropdownId(null);
                  }
                }}
                className={`w-full group relative p-3 sm:p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between min-h-[100px] sm:min-h-[108px] cursor-pointer active:scale-[0.99] ${
                  isSelectedOrHasActiveChild
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : isOpen
                    ? 'bg-slate-50 dark:bg-slate-800/90 border-indigo-500 dark:border-indigo-500 text-slate-900 dark:text-white shadow-md ring-2 ring-indigo-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5 sm:mb-2 w-full">
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                      isSelectedOrHasActiveChild
                        ? 'bg-white/20 text-white'
                        : isOpen
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </div>

                  <div className="flex items-center gap-1">
                    {subcategories.length > 0 && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                          isSelectedOrHasActiveChild
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {subcategories.length}
                      </span>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180' : ''
                      } ${
                        isSelectedOrHasActiveChild
                          ? 'text-white'
                          : isOpen
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                    />
                  </div>
                </div>

                <div className="min-w-0 w-full">
                  <h3 className="font-bold text-xs sm:text-sm truncate leading-tight">
                    {cat.name}
                  </h3>
                  {activeSubcategory ? (
                    <p className="text-[10px] sm:text-[11px] font-semibold mt-0.5 truncate text-indigo-100">
                      {activeSubcategory.name}
                    </p>
                  ) : (
                    <p
                      className={`text-[10px] sm:text-[11px] font-medium mt-0.5 truncate ${
                        isSelectedOrHasActiveChild
                          ? 'text-indigo-100'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {cat.item_count !== undefined && cat.item_count > 0
                        ? `${cat.item_count} listings`
                        : `${subcategories.length} subcategories`}
                    </p>
                  )}
                </div>
              </button>

              {/* Subcategories Dropdown Menu */}
              {isOpen && subcategories.length > 0 && (
                <div
                  role="menu"
                  aria-label={`${cat.name} subcategories`}
                  className="absolute left-0 right-0 sm:left-0 sm:right-auto sm:min-w-[240px] mt-1.5 z-40 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-900/15 dark:shadow-black/40 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {cat.name}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      {subcategories.length} options
                    </span>
                  </div>

                  {/* Option: All in Parent Category */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectCategory(cat.id);
                      setOpenDropdownId(null);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isParentSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/70 font-semibold'
                    }`}
                  >
                    <span className="truncate">All {cat.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cat.item_count !== undefined && cat.item_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {cat.item_count}
                        </span>
                      )}
                      {isParentSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800/80" />

                  {/* Individual Subcategories */}
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/40">
                    {subcategories.map((sub) => {
                      const isSubSelected = selectedCategoryId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onSelectCategory(sub.id);
                            setOpenDropdownId(null);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isSubSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white font-medium'
                          }`}
                        >
                          <span className="truncate">{sub.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {sub.item_count !== undefined && sub.item_count > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                {sub.item_count}
                              </span>
                            )}
                            {isSubSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
