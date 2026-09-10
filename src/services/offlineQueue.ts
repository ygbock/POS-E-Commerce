import { OfflineTransaction } from '../types';

export function generateSecureUUID(): string {
  const cryptoObj = (typeof window !== 'undefined' ? window.crypto : null) || 
                    (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // Cryptographically safe-ish/robust fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DB_NAME = 'abacha_offline_db';
const STORE_NAME = 'offline_transactions';
const DB_VERSION = 1;

let memoryQueue: OfflineTransaction[] = [];

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class OfflineQueue {
  /**
   * Migrate any transactions currently in memoryQueue into IndexedDB.
   * Removes successfully stored entries from memoryQueue only after persistence.
   */
  static async migrateMemoryToIDB(dbInstance?: IDBDatabase | null): Promise<void> {
    if (memoryQueue.length === 0) return;
    const db = dbInstance || (await getIDB());
    if (!db) return;

    const itemsToMigrate = [...memoryQueue];
    const successfullyMigratedIds: string[] = [];

    await new Promise<void>((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        transaction.oncomplete = () => {
          memoryQueue = memoryQueue.filter((t) => !successfullyMigratedIds.includes(t.id));
          resolve();
        };
        transaction.onerror = () => {
          resolve();
        };
        transaction.onabort = () => {
          resolve();
        };

        for (const item of itemsToMigrate) {
          const req = store.put(item);
          req.onsuccess = () => {
            successfullyMigratedIds.push(item.id);
          };
          req.onerror = () => {
            // failed for this specific item, keep in memory
          };
        }
      } catch {
        resolve();
      }
    });
  }

  static async enqueue(
    operation: string,
    payload: any,
    tenantId: string,
    posSessionId: string,
    registerId?: string,
    idempotencyKey?: string
  ): Promise<OfflineTransaction> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '' || tenantId === 'org_default') {
      throw new Error('TENANT_REQUIRED: A valid authenticated tenant identifier is required to enqueue offline transactions.');
    }

    const tx: OfflineTransaction = {
      id: generateSecureUUID(),
      idempotencyKey: idempotencyKey || generateSecureUUID(),
      tenantId: tenantId.trim(),
      posSessionId,
      registerId,
      operation,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
    };

    const db = await getIDB();
    if (!db) {
      memoryQueue.push(tx);
      return tx;
    }

    // If IndexedDB is available, migrate any prior memory items first
    if (memoryQueue.length > 0) {
      await this.migrateMemoryToIDB(db);
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(tx);
        request.onsuccess = () => resolve(tx);
        request.onerror = () => {
          memoryQueue.push(tx); // fallback to memory on failure
          resolve(tx);
        };
      } catch (err) {
        memoryQueue.push(tx);
        resolve(tx);
      }
    });
  }

  static async getTransactions(organizationId?: string): Promise<OfflineTransaction[]> {
    const db = await getIDB();
    let allTransactions: OfflineTransaction[] = [];

    if (!db) {
      allTransactions = [...memoryQueue];
    } else {
      // Migrate pending memory transactions into IndexedDB
      if (memoryQueue.length > 0) {
        await this.migrateMemoryToIDB(db);
      }

      const idbTransactions = await new Promise<OfflineTransaction[]>((resolve) => {
        try {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.getAll();
          request.onsuccess = () => {
            const results = (request.result as OfflineTransaction[]) || [];
            resolve(results);
          };
          request.onerror = () => {
            resolve([]);
          };
        } catch {
          resolve([]);
        }
      });

      // Combine IDB transactions with any unmigrated memory items, deduplicating by ID
      const seenIds = new Set<string>();
      for (const tx of idbTransactions) {
        seenIds.add(tx.id);
        allTransactions.push(tx);
      }
      for (const tx of memoryQueue) {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id);
          allTransactions.push(tx);
        }
      }
    }

    // Filter strictly by organization if specified
    if (organizationId) {
      allTransactions = allTransactions.filter((t) => t.tenantId === organizationId);
    }

    return allTransactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  static async updateTransaction(tx: OfflineTransaction): Promise<void> {
    // Update in memoryQueue if present
    const idx = memoryQueue.findIndex((t) => t.id === tx.id);
    if (idx !== -1) {
      memoryQueue[idx] = { ...tx };
    }

    const db = await getIDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(tx);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  static async removeTransaction(id: string): Promise<void> {
    // Remove from memoryQueue
    memoryQueue = memoryQueue.filter((t) => t.id !== id);

    const db = await getIDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  static async clearQueue(): Promise<void> {
    memoryQueue = [];
    const db = await getIDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
