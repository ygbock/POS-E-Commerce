import { Product, ProductVariant } from '../../types';

export type StorefrontSort =
  | 'featured'
  | 'price-low'
  | 'price-high'
  | 'rating'
  | 'best-sellers'
  | 'newest';

export interface StorefrontCatalogFilters {
  category: string;
  brand: string;
  searchQuery: string;
  minPrice: number;
  maxPrice: number;
  inStockOnly: boolean;
  onSaleOnly: boolean;
  minRating: number;
}

const primaryPrice = (product: Product): number => Number(product.variants[0]?.retailPrice ?? 0);
const compareAtPrice = (product: Product): number | null => {
  const value = product.variants[0]?.compareAtPrice ?? product.compareAtPrice;
  return value == null ? null : Number(value);
};

export function filterStorefrontProducts(
  products: Product[],
  filters: StorefrontCatalogFilters,
  getTotalStockForVariant: (variant?: ProductVariant) => number,
): Product[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return products.filter((product) => {
    if (product.status !== 'active') return false;
    if (filters.category !== 'All' && product.category !== filters.category) return false;
    if (filters.brand !== 'All' && product.brand.toLowerCase() !== filters.brand.toLowerCase()) return false;

    if (query) {
      const matches = [
        product.name,
        product.brand,
        product.category,
        ...product.tags,
      ].some((value) => value.toLowerCase().includes(query));
      if (!matches) return false;
    }

    const price = primaryPrice(product);
    if (price < filters.minPrice || price > filters.maxPrice) return false;

    if (filters.inStockOnly && getTotalStockForVariant(product.variants[0]) <= 0) return false;

    const salePrice = compareAtPrice(product);
    if (filters.onSaleOnly && (salePrice == null || salePrice <= price)) return false;

    if (filters.minRating > 0 && product.rating < filters.minRating) return false;
    return true;
  });
}

export function sortStorefrontProducts(products: Product[], sortBy: StorefrontSort): Product[] {
  return [...products].sort((a, b) => {
    const priceA = primaryPrice(a);
    const priceB = primaryPrice(b);

    if (sortBy === 'price-low') return priceA - priceB;
    if (sortBy === 'price-high') return priceB - priceA;
    if (sortBy === 'rating') return b.rating - a.rating;
    if (sortBy === 'best-sellers') return (b.salesCount || 0) - (a.salesCount || 0);
    if (sortBy === 'newest') return b.id.localeCompare(a.id);
    return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
  });
}
