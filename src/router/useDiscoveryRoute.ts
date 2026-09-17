import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDiscoveryPath, buildDiscoveryPath, DiscoveryRoute } from './DiscoveryRouter';

export function useDiscoveryRoute() {
  const [route, setRoute] = useState<DiscoveryRoute>(() => parseDiscoveryPath());

  useEffect(() => {
    const onPopState = () => setRoute(parseDiscoveryPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: DiscoveryRoute | string, replace = false) => {
    const path = typeof next === 'string' ? next : buildDiscoveryPath(next);
    if (path === window.location.pathname + window.location.search) return;
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    setRoute(parseDiscoveryPath());
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return useMemo(() => ({ route, navigate }), [route, navigate]);
}
