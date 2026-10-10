/**
 * Frontend Authentication Client (SEC-001)
 *
 * Manages server-issued cryptographic JWTs, handles login/logout,
 * and attaches Authorization: Bearer <token> headers to outbound requests.
 */

export class PlatformMfaChallengeError extends Error {
  constructor(public readonly code: 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED', public readonly challenge: string, public readonly expiresAt: string) {
    super(code);
    this.name = 'PlatformMfaChallengeError';
  }
}

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
    // Authentication is carried by the HttpOnly session cookie. When an in-memory
    // access token is also available on the current page, include it as Bearer fallback.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.currentToken) {
      headers.Authorization = `Bearer ${this.currentToken}`;
    }
    return headers;
  }

  private getRequestInit(init: RequestInit = {}): RequestInit {
    return { ...init, credentials: 'include' };
  }

  private async parseJson(res: Response, fallbackMessage = 'Server is temporarily unavailable. Please try again.'): Promise<any> {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.status >= 500 ? 'Server is restarting or temporarily unavailable. Please try again in a moment.' : fallbackMessage);
    }
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
    const data = await this.parseJson(res, 'Unable to create business account.');
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
    const data = await this.parseJson(res, 'Unable to sign in to the business owner portal.');
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
    const data = await this.parseJson(res, 'Platform authentication failed.');
    if (!res.ok || !data.success) {
      const code = data.error?.code;
      if ((code === 'MFA_REQUIRED' || code === 'MFA_ENROLLMENT_REQUIRED') && data.data?.challenge) {
        throw new PlatformMfaChallengeError(code, data.data.challenge, data.data.expiresAt);
      }
      throw new Error(data.error?.message || 'Platform authentication failed');
    }
    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    }
    return data.data.user;
  }

  async setupPlatformMfa(challenge: string): Promise<{ secret: string; otpauthUri: string; expiresAt: string }> {
    const res = await fetch('/api/auth/platform/mfa/setup', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge }),
    }));
    const data = await this.parseJson(res, 'Unable to initialize platform MFA.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to initialize platform MFA.');
    return data.data;
  }

  async resetPlatformMfaEnrollment(email: string, password: string): Promise<{ challenge: string; secret: string; otpauthUri: string; expiresAt: string }> {
    const res = await fetch('/api/auth/platform/mfa/reset-enrollment', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    }));
    const data = await this.parseJson(res, 'Unable to reset platform MFA setup.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to reset platform MFA setup.');
    return data.data;
  }

  async skipPlatformMfa(email: string, password: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/platform/mfa/skip', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    }));
    const data = await this.parseJson(res, 'Unable to continue without MFA.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to continue without MFA.');
    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    return data.data.user;
  }

  async confirmPlatformMfaEnrollment(challenge: string, code: string): Promise<{ user: AuthUser; recoveryCodes: string[] }> {
    const res = await fetch('/api/auth/platform/mfa/confirm-enrollment', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code }),
    }));
    const data = await this.parseJson(res, 'Unable to complete platform MFA enrollment.');
    if (!res.ok || !data.success) {
      const err: any = new Error(data.error?.message || 'Unable to complete platform MFA enrollment.');
      err.code = data.error?.code;
      throw err;
    }
    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    return { user: data.data.user, recoveryCodes: data.data.recoveryCodes };
  }

  async verifyPlatformMfa(challenge: string, code: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/platform/mfa/verify', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code }),
    }));
    const data = await this.parseJson(res, 'Unable to verify platform MFA.');
    if (!res.ok || !data.success) {
      const err: any = new Error(data.error?.message || 'Unable to verify platform MFA.');
      err.code = data.error?.code;
      throw err;
    }
    this.currentToken = data.data.token;
    this.currentUser = data.data.user;
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
    return data.data.user;
  }

  async registerCustomer(input: {
    name: string;
    email: string;
    phone?: string;
    password?: string;
  }): Promise<AuthUser> {
    const res = await fetch('/api/auth/customer/register', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }));
    const data = await this.parseJson(res, 'Unable to register customer account.');
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Unable to register customer account.');
    }
    return data.data.user;
  }

  async getCustomerAccount(): Promise<{
    id: string;
    organizationId: string;
    email: string;
    name: string;
    phone: string | null;
    emailVerified: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }> {
    const res = await fetch('/api/auth/customer/account', this.getRequestInit({
      method: 'GET',
      headers: this.getAuthHeaders(),
    }));
    const data = await this.parseJson(res, 'Unable to load customer account.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to load customer account.');
    return data.data;
  }

  async updateCustomerAccount(input: { name: string; phone?: string | null }) {
    const res = await fetch('/api/auth/customer/account', this.getRequestInit({
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(input),
    }));
    const data = await this.parseJson(res, 'Unable to update customer account.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to update customer account.');
    this.currentUser = {
      ...(this.currentUser || {}),
      id: data.data.id,
      organizationId: data.data.organizationId,
      email: data.data.email,
      name: data.data.name,
      role: 'customer',
      identityType: 'customer',
      permissions: [],
    } as AuthUser;
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(this.currentUser));
    return data.data;
  }

  async changeCustomerPassword(currentPassword: string, newPassword: string): Promise<void> {
    const res = await fetch('/api/auth/customer/change-password', this.getRequestInit({
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    }));
    const data = await this.parseJson(res, 'Unable to change customer password.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to change customer password.');
    this.currentToken = null;
    this.currentUser = null;
    if (typeof window !== 'undefined') localStorage.removeItem(USER_KEY);
  }

  async deactivateCustomerAccount(currentPassword: string): Promise<void> {
    const res = await fetch('/api/auth/customer/deactivate', this.getRequestInit({
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ currentPassword }),
    }));
    const data = await this.parseJson(res, 'Unable to deactivate customer account.');
    if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to deactivate customer account.');
    this.currentToken = null;
    this.currentUser = null;
    if (typeof window !== 'undefined') localStorage.removeItem(USER_KEY);
  }

  async forgotPassword(email: string, organizationId?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/forgot-password', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, organizationId }),
    }));
    const data = await this.parseJson(res, 'Unable to request password reset.');
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Unable to request password reset.');
    }
    return data;
  }

  async resetPassword(token: string, password: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/reset-password', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }));
    const data = await this.parseJson(res, 'Unable to reset password.');
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Unable to reset password.');
    }
    return data;
  }

  async verifyEmailConfirm(token: string): Promise<{ success: boolean; message: string; data?: { status: string } }> {
    const res = await fetch('/api/auth/verify-email/confirm', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }));
    const data = await this.parseJson(res, 'Email verification failed.');
    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Email verification failed.');
    }
    return data;
  }

  async login(email: string, password: string, organizationId?: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/login', this.getRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // organizationId is optional. The server resolves the account's active organization
      // from the authenticated email when the user has a single organization.
      body: JSON.stringify(organizationId ? { email, password, organizationId } : { email, password }),
    }));

    const data = await this.parseJson(res, 'Authentication failed.');
    if (!res.ok || !data.success) {
      const err: any = new Error(data.error?.message || 'Authentication failed');
      err.code = data.error?.code;
      throw err;
    }

    this.currentToken = data.data.token;
    this.currentUser = data.data.user;

    if (typeof window !== 'undefined') {
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
