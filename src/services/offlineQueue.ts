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
  static async enqueue(
    operation: string,
    payload: any,
    tenantId: string,
    posSessionId: string,
    registerId?: string
  ): Promise<OfflineTransaction> {
    const tx: OfflineTransaction = {
      id: generateSecureUUID(),
      idempotencyKey: generateSecureUUID(),
      tenantId,
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

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(tx);
        request.onsuccess = () => resolve(tx);
        request.onerror = () => {
          memoryQueue.push(tx); // rollback/fallback to memory on failure
          resolve(tx);
        };
      } catch (err) {
        memoryQueue.push(tx);
        resolve(tx);
      }
    });
  }

  static async getTransactions(): Promise<OfflineTransaction[]> {
    const db = await getIDB();
    if (!db) {
      return [...memoryQueue].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          const results = (request.result as OfflineTransaction[]) || [];
          resolve(results.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        };
        request.onerror = () => {
          resolve([...memoryQueue].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        };
      } catch {
        resolve([...memoryQueue].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      }
    });
  }

  static async updateTransaction(tx: OfflineTransaction): Promise<void> {
    const db = await getIDB();
    if (!db) {
      const idx = memoryQueue.findIndex((t) => t.id === tx.id);
      if (idx !== -1) {
        memoryQueue[idx] = { ...tx };
      }
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(tx);
        request.onsuccess = () => resolve();
        request.onerror = () => {
          const idx = memoryQueue.findIndex((t) => t.id === tx.id);
          if (idx !== -1) {
            memoryQueue[idx] = { ...tx };
          }
          resolve();
        };
      } catch {
        const idx = memoryQueue.findIndex((t) => t.id === tx.id);
        if (idx !== -1) {
          memoryQueue[idx] = { ...tx };
        }
        resolve();
      }
    });
  }

  static async removeTransaction(id: string): Promise<void> {
    const db = await getIDB();
    if (!db) {
      memoryQueue = memoryQueue.filter((t) => t.id !== id);
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => {
          memoryQueue = memoryQueue.filter((t) => t.id !== id);
          resolve();
        };
      } catch {
        memoryQueue = memoryQueue.filter((t) => t.id !== id);
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
