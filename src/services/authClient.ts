/**
 * Frontend Authentication Client (SEC-001)
 *
 * Manages server-issued cryptographic JWTs, handles login/logout,
 * and attaches Authorization: Bearer <token> headers to outbound requests.
 */

export interface AuthUser {
  id: string;
  organizationId?: string;
  email: string;
  name: string;
  role: string;
  identityType?: 'platform' | 'business_owner' | 'staff' | 'customer';
  permissions: string[];
  locationId?: string | null;
}

const USER_KEY = 'abacha_auth_user';

/**
 * Demo persona credentials are intentionally supplied through Vite development
 * environment variables. They are never embedded in the production bundle.
 * Production authentication always uses the normal login form/API.
 */
const DEMO_PERSONA_ENV: Record<string, [string, string]> = {
  'Super Admin': ['VITE_DEMO_SUPER_ADMIN_EMAIL', 'VITE_DEMO_SUPER_ADMIN_PASSWORD'],
  'Business Owner': ['VITE_DEMO_BUSINESS_OWNER_EMAIL', 'VITE_DEMO_BUSINESS_OWNER_PASSWORD'],
  'Store Manager': ['VITE_DEMO_STORE_MANAGER_EMAIL', 'VITE_DEMO_STORE_MANAGER_PASSWORD'],
  'Cashier': ['VITE_DEMO_CASHIER_EMAIL', 'VITE_DEMO_CASHIER_PASSWORD'],
  'Inventory Manager': ['VITE_DEMO_INVENTORY_MANAGER_EMAIL', 'VITE_DEMO_INVENTORY_MANAGER_PASSWORD'],
  'Warehouse Manager': ['VITE_DEMO_WAREHOUSE_MANAGER_EMAIL', 'VITE_DEMO_WAREHOUSE_MANAGER_PASSWORD'],
  'Accountant': ['VITE_DEMO_ACCOUNTANT_EMAIL', 'VITE_DEMO_ACCOUNTANT_PASSWORD'],
  'E-commerce Customer': ['VITE_DEMO_ECOMMERCE_CUSTOMER_EMAIL', 'VITE_DEMO_ECOMMERCE_CUSTOMER_PASSWORD'],
  'System Owner': ['VITE_DEMO_SYSTEM_OWNER_EMAIL', 'VITE_DEMO_SYSTEM_OWNER_PASSWORD'],
  'Platform Admin': ['VITE_DEMO_PLATFORM_ADMIN_EMAIL', 'VITE_DEMO_PLATFORM_ADMIN_PASSWORD'],
  'Platform Support': ['VITE_DEMO_PLATFORM_SUPPORT_EMAIL', 'VITE_DEMO_PLATFORM_SUPPORT_PASSWORD'],
  'Platform Finance': ['VITE_DEMO_PLATFORM_FINANCE_EMAIL', 'VITE_DEMO_PLATFORM_FINANCE_PASSWORD'],
};

class AuthClient {
  private currentToken: string | null = null;
  private currentUser: AuthUser | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const cachedUser = localStorage.getItem(USER_KEY);
      if (cachedUser) {
        try {
          this.currentUser = JSON.parse(cachedUser);
        } catch {
          this.currentUser = null;
        }
      }
    }
  }

  getToken(): string | null {
    return this.currentToken;
  }

  getUser(): AuthUser | null {
    return this.currentUser;
  }

  getAuthHeaders(): Record<string, string> {
    // Authentication is carried by the HttpOnly session cookie. No bearer token
    // is persisted in browser storage and JavaScript cannot read the session secret.
    return { 'Content-Type': 'application/json' };
  }

  private getRequestInit(init: RequestInit = {}): RequestInit {
    return { ...init, credentials: 'include' };
  }

  async registerBusinessOwner(input: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    businessMode: 'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE';
  }): Promise<AuthUser & { business: { id: string; publicId: string; name: string; slug: string; businessMode: string; listingStatus: string } }> {
    const res = await fetch('/api/merchant/signup', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }));
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to create business account.');
    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    }
    return { ...data.data.user, business: data.data.business };
  }

  async loginBusinessOwner(email: string, password: string): Promise<AuthUser> {
    const res = await fetch('/api/merchant/login', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    }));
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Unable to sign in to the business owner portal.');
    }

    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    }
    return data.data.user;
  }

  async loginPlatform(email: string, password: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/platform/login', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    }));
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Platform authentication failed');
    }
    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, data.data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    }
    return data.data.user;
  }

  async login(email: string, password: string, organizationId?: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/login', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // organizationId is optional. The server resolves the account's active organization
      // from the authenticated email when the user has a single organization.
      body: JSON.stringify(organizationId ? { email, password, organizationId } : { email, password }),
    }));

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Authentication failed');
    }

    this.currentToken = data.data.token;
    this.currentUser = data.data.user;

    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, data.data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    }

    return data.data.user;
  }

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', this.getRequestInit({
        method: 'POST',
        headers: this.getAuthHeaders(),
      }));
    } catch {
      // Continue clearing local state even if network fails.
    }

    this.currentToken = null;
    this.currentUser = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_KEY);
    }
  }

  async fetchMe(): Promise<AuthUser | null> {
    try {
      // On a fresh page load the access token is intentionally unavailable to
      // JavaScript. The HttpOnly refresh cookie silently establishes a new
      // short-lived access session when needed.
      if (!this.currentToken) {
        const refresh = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refresh.ok) {
          const refreshed = await refresh.json();
          this.currentToken = refreshed.data?.token || null;
          this.currentUser = refreshed.data?.user || null;
        }
      }

      const res = await fetch('/api/auth/me', this.getRequestInit({
        headers: this.getAuthHeaders(),
      }));
      if (!res.ok) {
        if (res.status === 401) {
          this.currentToken = null;
          this.currentUser = null;
          localStorage.removeItem(USER_KEY);
        }
        return null;
      }
      const data = await res.json();
      if (!data.success || !data.data) return null;
      this.currentUser = data.data;
      if (typeof window !== 'undefined') {
        localStorage.setItem(USER_KEY, JSON.stringify(data.data));
      }
      return data.data;
    } catch {
      return null;
    }
  }

  /**
   * Development-only persona helper. Credentials are read from Vite's DEV
   * environment and therefore cannot silently become production credentials.
   * Real production access must use the authenticated login flow.
   */
  async loginAsPersona(roleName: string): Promise<AuthUser | null> {
    if (!import.meta.env.DEV) {
      console.warn('[AuthClient] Persona auto-login is disabled outside development.');
      return null;
    }

    const envKeys = DEMO_PERSONA_ENV[roleName];
    if (!envKeys) {
      console.warn(`[AuthClient] Unknown demo persona: ${roleName}`);
      return null;
    }

    const [emailKey, passwordKey] = envKeys;
    const readEnvCredential = (key: string) => {
      const value = (import.meta.env as Record<string, string | undefined>)[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const email = readEnvCredential(emailKey);
    // Development seed trims ABACHA_PLATFORM_ADMIN_PASSWORD before hashing;
    // apply the same normalization to VITE persona credentials so the two
    // environment-variable paths cannot silently disagree on whitespace.
    const password = readEnvCredential(passwordKey);

    if (!email || !password) {
      console.warn(`[AuthClient] Demo credentials are not configured for persona '${roleName}'.`);
      return null;
    }

    try {
      const platformPersona = ['System Owner', 'Platform Admin', 'Platform Support', 'Platform Finance'].includes(roleName);
      const user = platformPersona ? await this.loginPlatform(email, password) : await this.login(email, password);
      const expectedRoles: Record<string, string> = {
        'Super Admin': 'super_admin',
        'Business Owner': 'business_owner',
        'Store Manager': 'manager',
        'Cashier': 'cashier',
        'Inventory Manager': 'inventory_manager',
        'Warehouse Manager': 'inventory_manager',
        'Accountant': 'sales_user',
        'E-commerce Customer': 'customer',
        'System Owner': 'system_owner',
        'Platform Admin': 'platform_admin',
        'Platform Support': 'platform_support',
        'Platform Finance': 'platform_finance',
      };
      const expectedRole = expectedRoles[roleName];
      if (expectedRole && user.role !== expectedRole) {
        await this.logout();
        throw new Error(`PERSONA_ROLE_MISMATCH: Expected ${expectedRole}, received ${user.role}`);
      }
      return user;
    } catch (err) {
      console.warn(`[AuthClient] Auto-login for persona '${roleName}' failed:`, err);
      return null;
    }
  }
}

export const authClient = new AuthClient();
