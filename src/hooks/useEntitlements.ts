import { useState, useEffect } from 'react';
import { subscriptionClient, EntitlementsDTO } from '../services/subscriptionClient';

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<EntitlementsDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntitlements = async () => {
    setLoading(true);
    try {
      const data = await subscriptionClient.getEntitlements();
      setEntitlements(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription entitlements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, []);

  const hasFeature = (featureName: string): boolean => {
    if (!entitlements || !entitlements.isAllowedAccess) return false;
    return Boolean(entitlements.features[featureName]);
  };

  const isWithinLimit = (limitName: string, requested = 1): boolean => {
    if (!entitlements || !entitlements.isAllowedAccess) return false;
    const max = entitlements.limits[limitName] ?? 0;
    const current = entitlements.usage[limitName] ?? 0;
    return current + requested <= max;
  };

  return {
    entitlements,
    loading,
    error,
    refresh: fetchEntitlements,
    hasFeature,
    isWithinLimit,
  };
}
