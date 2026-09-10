import { OfflineTransaction } from '../types';
import { OfflineQueue } from './offlineQueue';
import { authClient } from './authClient';

export type NetworkState = 'online' | 'offline' | 'syncing' | 'synced' | 'sync_failed';

export type SyncStateListener = (state: NetworkState, pendingCount: number) => void;

class SyncService {
  private state: NetworkState = 'online';
  private listeners: Set<SyncStateListener> = new Set();
  private syncLock = false;
  private MAX_ATTEMPTS = 5;
  private INITIAL_BACKOFF_MS = 1000;
  private MAX_BACKOFF_MS = 30000;

  constructor() {
    if (typeof window !== 'undefined') {
      // Determine initial state (do not trust navigator.onLine completely, but use as a starting point)
      this.state = navigator.onLine ? 'online' : 'offline';

      window.addEventListener('online', () => {
        this.updateState('online');
        this.sync();
      });

      window.addEventListener('offline', () => {
        this.updateState('offline');
      });
    }
  }

  // Allow manual override for testing and UI control
  setMockOffline(isOffline: boolean) {
    this.updateState(isOffline ? 'offline' : 'online');
  }

  getState(): NetworkState {
    return this.state;
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    // Call immediately with current state
    this.getPendingCount().then((count) => {
      listener(this.state, count);
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async getPendingCount(): Promise<number> {
    const txs = await OfflineQueue.getTransactions();
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

  /**
   * Determine if the HTTP error / response is retryable or permanent.
   */
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

    // Do not attempt syncing if explicitly offline
    if (this.state === 'offline') {
      return false;
    }

    this.syncLock = true;
    this.updateState('syncing');

    let allSuccessful = true;
    try {
      const txs = await OfflineQueue.getTransactions();
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
          // Re-verify if we are mock-offline before actually hitting API
          if (this.getState() === 'offline') {
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
          // 1. Success! Delete from queue
          await OfflineQueue.removeTransaction(tx.id);
        } else {
          // Check for idempotency conflict. If the error code is IDEMPOTENCY_CONFLICT,
          // it means this order was already processed on the server, so we can safely treat it as a success!
          const isIdempotencyConflict = 
            responseStatus === 409 || 
            responseData?.error?.code === 'IDEMPOTENCY_CONFLICT' ||
            fetchError.message.includes('IDEMPOTENCY_CONFLICT');

          if (isIdempotencyConflict) {
            // Already processed by server! Treat as success.
            await OfflineQueue.removeTransaction(tx.id);
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

      // Check if there are any remaining pending or syncing transactions
      const remaining = await OfflineQueue.getTransactions();
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
