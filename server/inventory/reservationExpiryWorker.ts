import { ReservationService } from './reservationService';
import { DatabaseClient } from '../db/client';

export interface ExpiryWorkerHandle {
  stop: () => void;
  runNow: () => Promise<{ expiredCount: number; reservationIds: string[] }>;
}

/**
 * Background worker to automatically expire stale inventory reservations
 * past their expires_at timestamp, releasing reserved stock back to on-hand.
 */
export function startReservationExpiryWorker(
  options: {
    reservationService?: ReservationService;
    db?: DatabaseClient;
    intervalMs?: number;
    onError?: (err: any) => void;
  } = {}
): ExpiryWorkerHandle {
  const service = options.reservationService || new ReservationService(undefined, undefined, options.db);
  const intervalMs = options.intervalMs || 60000; // default 60s
  let isRunning = true;
  let timer: NodeJS.Timeout | null = null;
  let activeRun: Promise<any> | null = null;

  const runCycle = async () => {
    if (!isRunning) return { expiredCount: 0, reservationIds: [] };
    try {
      const result = await service.expireStaleReservations();
      if (result.expiredCount > 0) {
        console.log(`[ReservationExpiryWorker] Expired ${result.expiredCount} stale reservation(s):`, result.reservationIds);
      }
      return result;
    } catch (err) {
      if (options.onError) {
        options.onError(err);
      } else {
        console.error('[ReservationExpiryWorker] Error running reservation expiry sweep:', err);
      }
      return { expiredCount: 0, reservationIds: [] };
    }
  };

  const scheduleNext = () => {
    if (!isRunning) return;
    timer = setTimeout(async () => {
      if (!isRunning) return;
      activeRun = runCycle();
      await activeRun;
      activeRun = null;
      scheduleNext();
    }, intervalMs);
    // Ensure timer doesn't prevent Node process termination in test environments
    if (timer.unref) {
      timer.unref();
    }
  };

  // Schedule initial cycle
  scheduleNext();

  return {
    stop: () => {
      isRunning = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    runNow: async () => {
      return runCycle();
    },
  };
}
