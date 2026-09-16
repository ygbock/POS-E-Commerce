import { authClient } from './authClient';

export interface EntitlementsDTO {
  plan: {
    code: string;
    name: string;
  };
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired';
  isAllowedAccess: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  usage: Record<string, number>;
}

class SubscriptionClient {
  /**
   * Fetches the server-authoritative entitlement state for the current tenant context.
   */
  async getEntitlements(): Promise<EntitlementsDTO | null> {
    try {
      const response = await fetch('/api/tenant/subscription/entitlements', {
        headers: authClient.getAuthHeaders(),
      });
      if (!response.ok) {
        return null;
      }
      const json = await response.json();
      return json.data || null;
    } catch {
      return null;
    }
  }
}

export const subscriptionClient = new SubscriptionClient();
