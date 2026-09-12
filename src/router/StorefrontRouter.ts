import { useCallback, useEffect, useMemo, useState } from 'react';

export type StorefrontRoute =
  | { name: 'home'; tenantSlug?: string }
  | { name: 'shop'; tenantSlug?: string }
  | { name: 'category'; tenantSlug?: string; slug: string }
  | { name: 'brand'; tenantSlug?: string; slug: string }
  | { name: 'search'; tenantSlug?: string; query?: string }
  | { name: 'product'; tenantSlug?: string; slug: string }
  | { name: 'cart'; tenantSlug?: string }
  | { name: 'checkout'; tenantSlug?: string }
  | { name: 'account'; tenantSlug?: string }
  | { name: 'order'; tenantSlug?: string; orderNumber: string }
  | { name: 'not-found'; tenantSlug?: string };

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizePath = (path: string) => {
  const normalized = path.replace(//+/g, '/').replace(//$/, '');
  return normalized || '/';
};

export function parseStorefrontRoute(pathname = window.location.pathname, search = window.location.search): StorefrontRoute {
  const segments = normalizePath(pathname).split('/').filter(Boolean).map(decode);
  let tenantSlug: string | undefined;

  if (segments[0] === 'store' && segments[1]) {
    tenantSlug = segments[1];
    segments.splice(0, 2);
  }

  const [first, second] = segments;
  const params = new URLSearchParams(search);

  if (!first) return { name: 'home', tenantSlug };
  if (first === 'shop' && !second) return { name: 'shop', tenantSlug };
  if (first === 'shop' && second === 'category' && segments[2]) {
    return { name: 'category', tenantSlug, slug: segments[2] };
  }
  if (first === 'shop' && second === 'brand' && segments[2]) {
    return { name: 'brand', tenantSlug, slug: segments[2] };
  }
  if (first === 'search') return { name: 'search', tenantSlug, query: params.get('q') || undefined };
  if (first === 'product' && second) return { name: 'product', tenantSlug, slug: second };
  if (first === 'cart') return { name: 'cart', tenantSlug };
  if (first === 'checkout') return { name: 'checkout', tenantSlug };
  if (first === 'account') return { name: 'account', tenantSlug };
  if (first === 'order' && second) return { name: 'order', tenantSlug, orderNumber: second };

  return { name: 'not-found', tenantSlug };
}

export function buildStorefrontPath(route: StorefrontRoute): string {
  const prefix = route.tenantSlug ? `/store/${encodeURIComponent(route.tenantSlug)}` : '';

  switch (route.name) {
    case 'home': return `${prefix}/`;
    case 'shop': return `${prefix}/shop`;
    case 'category': return `${prefix}/shop/category/${encodeURIComponent(route.slug)}`;
    case 'brand': return `${prefix}/shop/brand/${encodeURIComponent(route.slug)}`;
    case 'search': {
      const query = route.query?.trim();
      return query ? `${prefix}/search?q=${encodeURIComponent(query)}` : `${prefix}/search`;
    }
    case 'product': return `${prefix}/product/${encodeURIComponent(route.slug)}`;
    case 'cart': return `${prefix}/cart`;
    case 'checkout': return `${prefix}/checkout`;
    case 'account': return `${prefix}/account`;
    case 'order': return `${prefix}/order/${encodeURIComponent(route.orderNumber)}`;
    case 'not-found': return `${prefix}/404`;
  }
}

export function useStorefrontRoute() {
  const [route, setRoute] = useState<StorefrontRoute>(() => parseStorefrontRoute());

  useEffect(() => {
    const onPopState = () => setRoute(parseStorefrontRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: StorefrontRoute | string, replace = false) => {
    const path = typeof next === 'string' ? next : buildStorefrontPath(next);
    if (path === window.location.pathname + window.location.search) return;
    if (replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
    setRoute(parseStorefrontRoute());
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return useMemo(() => ({ route, navigate }), [route, navigate]);
}
