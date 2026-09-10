import { OfflineTransaction } from '../types';
import { OfflineQueue } from './offlineQueue';
import { authClient } from './authClient';

export type NetworkState = 'online' | 'offline' | 'syncing' | 'synced' | 'sync_failed';

export type SyncStateListener = (state: NetworkState, pendingCount: number) => void;
export type PostSyncReconciliationHandler = (tx: OfflineTransaction, responseData: any) => Promise<void> | void;

class SyncService {
  private state: NetworkState = 'online';
  private isMockOffline = false;
  private isRealNetworkOnline = true;
  private listeners: Set<SyncStateListener> = new Set();
  private reconciliationHandlers: Set<PostSyncReconciliationHandler> = new Set();
  private syncLock = false;
  private MAX_ATTEMPTS = 5;
  private INITIAL_BACKOFF_MS = 1000;
  private MAX_BACKOFF_MS = 30000;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isRealNetworkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      this.state = this.isRealNetworkOnline ? 'online' : 'offline';

      window.addEventListener('online', () => {
        this.isRealNetworkOnline = true;
        if (!this.isMockOffline) {
          this.updateState('online');
          this.sync();
        }
      });

      window.addEventListener('offline', () => {
        this.isRealNetworkOnline = false;
        this.updateState('offline');
      });
    }
  }

  // Allow manual override for testing and UI simulation
  setMockOffline(isOffline: boolean) {
    this.isMockOffline = isOffline;
    if (isOffline) {
      this.updateState('offline');
    } else {
      this.updateState(this.isRealNetworkOnline ? 'online' : 'offline');
    }
  }

  isMockingOffline(): boolean {
    return this.isMockOffline;
  }

  isRealOffline(): boolean {
    return !this.isRealNetworkOnline;
  }

  getState(): NetworkState {
    return this.state;
  }

  registerReconciliationHandler(handler: PostSyncReconciliationHandler): () => void {
    this.reconciliationHandlers.add(handler);
    return () => {
      this.reconciliationHandlers.delete(handler);
    };
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    this.getPendingCount().then((count) => {
      listener(this.state, count);
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async getPendingCount(): Promise<number> {
    const user = authClient.getUser();
    const orgId = user?.organizationId && user.organizationId !== 'org_default' ? user.organizationId : undefined;
    const txs = await OfflineQueue.getTransactions(orgId);
    return txs.filter((t) => t.status !== 'failed').length;
  }

  private async notifyListeners() {
    const count = await this.getPendingCount();
    this.listeners.forEach((l) => l(this.state, count));
  }

  private updateState(newState: NetworkState) {
    this.state = newState;
    this.notifyListeners();
  }

  isRetryable(status: number): boolean {
    // 5xx errors or server timeout/unreachable (status 0) are retryable
    if (status === 0 || (status >= 500 && status <= 599)) {
      return true;
    }
    // 4xx errors are client errors/malformed/forbidden and are NOT retryable
    return false;
  }

  async sync(): Promise<boolean> {
    // Acquire synchronization lock to prevent concurrent sync operations
    if (this.syncLock) {
      return false;
    }

    // Do not attempt syncing if offline (either simulated or real)
    if (this.state === 'offline' || this.isMockOffline || !this.isRealNetworkOnline) {
      return false;
    }

    // Strict Tenant Isolation: Must have an authenticated user with a valid organizationId
    const currentUser = authClient.getUser();
    if (!currentUser || !currentUser.organizationId || currentUser.organizationId.trim() === '' || currentUser.organizationId === 'org_default') {
      // Fail closed! Do not guess a tenant or use org_default
      return false;
    }

    const currentTenantId = currentUser.organizationId.trim();

    this.syncLock = true;
    this.updateState('syncing');

    let allSuccessful = true;
    try {
      // Retrieve ONLY transactions belonging to the authenticated tenant
      const txs = await OfflineQueue.getTransactions(currentTenantId);
      const now = Date.now();
      const eligibleTxs = txs.filter((t) => {
        if (t.status === 'failed') {
          return false; // Permanent failure, do not retry
        }
        // If it's pending, check backoff delay
        if (t.status === 'pending' && t.attempts > 0 && t.lastAttemptAt) {
          const delay = Math.min(this.INITIAL_BACKOFF_MS * Math.pow(2, t.attempts - 1), this.MAX_BACKOFF_MS);
          const timeSinceLastAttempt = now - new Date(t.lastAttemptAt).getTime();
          if (timeSinceLastAttempt < delay) {
            return false; // Skip for now (still backing off)
          }
        }
        return t.status === 'pending';
      });

      for (const tx of eligibleTxs) {
        tx.status = 'syncing';
        tx.lastAttemptAt = new Date().toISOString();
        await OfflineQueue.updateTransaction(tx);
        await this.notifyListeners();

        let responseStatus = 0;
        let responseData: any = null;
        let fetchError: Error | null = null;

        try {
          if (this.isMockOffline || !this.isRealNetworkOnline) {
            throw new Error('Offline');
          }

          const headers: Record<string, string> = {
            ...authClient.getAuthHeaders(),
            'idempotency-key': tx.idempotencyKey,
          };

          const res = await fetch('/api/pos/checkout', {
            method: 'POST',
            headers,
            body: JSON.stringify(tx.payload),
          });

          responseStatus = res.status;
          responseData = await res.json().catch(() => null);

          if (!res.ok) {
            throw new Error(responseData?.error?.message || `HTTP_ERROR: ${res.status}`);
          }
        } catch (err: any) {
          fetchError = err;
        }

        // Processing response
        if (!fetchError) {
          // 1. Success (Fresh checkout or genuine idempotent replay returning 200/201)
          await OfflineQueue.removeTransaction(tx.id);

          // Invoke post-sync reconciliation handlers (reconciling inventory/catalog)
          for (const handler of this.reconciliationHandlers) {
            try {
              await handler(tx, responseData);
            } catch (recErr) {
              console.warn('[SyncService] Post-sync reconciliation error:', recErr);
            }
          }
        } else {
          // STEP 3: Check for Idempotency Conflict vs Genuine Replay
          const isConflictRejection = 
            responseStatus === 409 || 
            responseData?.error?.code === 'IDEMPOTENCY_CONFLICT' ||
            fetchError.message.includes('IDEMPOTENCY_CONFLICT');

          if (isConflictRejection) {
            // Actual conflict/rejection: The server rejected this because the idempotency key
            // was reused with different parameters/fingerprint.
            // DO NOT delete the queued transaction!
            // Mark it as failed, preserve error metadata for cashier reconciliation, and do not retry.
            tx.status = 'failed';
            const code = responseData?.error?.code || 'IDEMPOTENCY_CONFLICT';
            const rawMsg = responseData?.error?.message || fetchError.message || 'Key reused with different parameters';
            tx.lastError = rawMsg.includes('IDEMPOTENCY_CONFLICT') ? rawMsg : `${code}: ${rawMsg}`;
            await OfflineQueue.updateTransaction(tx);
            allSuccessful = false;
            continue;
          }

          // Let's increment attempts and classify error
          tx.attempts += 1;
          const retryable = this.isRetryable(responseStatus);

          if (retryable && tx.attempts < this.MAX_ATTEMPTS) {
            // Transient retry
            tx.status = 'pending';
            tx.lastError = fetchError.message;
            await OfflineQueue.updateTransaction(tx);
            allSuccessful = false;
          } else {
            // Permanent failure or max attempts reached
            tx.status = 'failed';
            tx.lastError = `Permanent failure: ${fetchError.message}`;
            await OfflineQueue.updateTransaction(tx);
            allSuccessful = false;
          }
        }
      }

      // Check if there are any remaining pending or syncing transactions for this tenant
      const remaining = await OfflineQueue.getTransactions(currentTenantId);
      const unresolvedCount = remaining.filter((t) => t.status !== 'failed').length;

      if (unresolvedCount === 0) {
        this.updateState(allSuccessful ? 'synced' : 'sync_failed');
      } else {
        this.updateState('sync_failed');
      }
    } catch (err) {
      allSuccessful = false;
      this.updateState('sync_failed');
    } finally {
      this.syncLock = false;
    }

    return allSuccessful;
  }
}

export const syncService = new SyncService();

