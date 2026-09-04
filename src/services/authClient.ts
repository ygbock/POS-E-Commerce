/**
 * Frontend Authentication Client (SEC-001)
 * 
 * Manages server-issued cryptographic JWTs, handles login/logout,
 * and attaches Authorization: Bearer <token> headers to outbound requests.
 */

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  locationId?: string | null;
}

const TOKEN_KEY = 'omnicore_auth_jwt';
const USER_KEY = 'omnicore_auth_user';

class AuthClient {
  private currentToken: string | null = null;
  private currentUser: AuthUser | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentToken = localStorage.getItem(TOKEN_KEY);
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.currentToken) {
      headers['Authorization'] = `Bearer ${this.currentToken}`;
    }
    return headers;
  }

  async login(email: string, password: string, organizationId = 'org_default'): Promise<AuthUser> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, organizationId }),
    });

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
    if (this.currentToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: this.getAuthHeaders(),
        });
      } catch {
        // Continue clearing local state even if network fails
      }
    }

    this.currentToken = null;
    this.currentUser = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  async fetchMe(): Promise<AuthUser | null> {
    if (!this.currentToken) return null;

    try {
      const res = await fetch('/api/auth/me', {
        headers: this.getAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401) {
          this.logout();
        }
        return null;
      }
      const data = await res.json();
      return data.data;
    } catch {
      return null;
    }
  }

  /**
   * Helper to synchronize the client session when persona switcher is clicked in UI.
   * Logs in as the server-authoritative seeded persona.
   */
  async loginAsPersona(roleName: string): Promise<AuthUser | null> {
    const personaMap: Record<string, { email: string; pass: string }> = {
      'Super Admin': { email: 'superadmin@omnicore.internal', pass: 'SuperAdmin123!' },
      'Business Owner': { email: 'superadmin@omnicore.internal', pass: 'SuperAdmin123!' },
      'Store Manager': { email: 'manager@omnicore.internal', pass: 'ManagerPass123!' },
      'Cashier': { email: 'cashier@omnicore.internal', pass: 'CashierPass123!' },
      'Inventory Manager': { email: 'inventory@omnicore.internal', pass: 'InventoryPass123!' },
      'Warehouse Manager': { email: 'inventory@omnicore.internal', pass: 'InventoryPass123!' },
      'Accountant': { email: 'sales@omnicore.internal', pass: 'SalesPass123!' },
      'E-commerce Customer': { email: 'viewer@omnicore.internal', pass: 'ViewerPass123!' },
    };

    const target = personaMap[roleName] || { email: 'viewer@omnicore.internal', pass: 'ViewerPass123!' };
    try {
      return await this.login(target.email, target.pass);
    } catch (err) {
      console.warn(`[AuthClient] Auto-login for persona '${roleName}' failed:`, err);
      return null;
    }
  }
}

export const authClient = new AuthClient();
