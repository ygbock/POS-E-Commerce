/**
 * Omnicore Development & Testing Seed Fixtures (CLI Tool Only)
 * 
 * CRITICAL ARCHITECTURAL CONTRACT:
 * - This file houses development and testing fixture users and seeds.
 * - This script is NEVER imported or executed by the application startup sequence (server.ts).
 * - Production startup is permanently decoupled from default credential seeding.
 * - Execution in production environment (NODE_ENV === 'production') throws a fatal security error immediately.
 */

import { getDatabaseClient } from '../client';
import { AuthService } from '../../services/authService';

export async function runDevSeed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[Omnicore Security Fatal] CRITICAL SECURITY VIOLATION: dev/test seeding must NEVER execute in production.'
    );
  }

  const db = getDatabaseClient();
  try {
    const authService = new AuthService(db);
    console.log('[Omnicore Seed CLI] Seeding development fixture users into database...');
    await authService.seedDefaultUsers();
    console.log('[Omnicore Seed CLI] Development fixture users successfully seeded.');
  } finally {
    try {
      await db.close();
    } catch {
      // Ignore close errors during script exit
    }
  }
}

// CLI entrypoint execution
const isDirectCli = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('dev_seed.ts') ||
      process.argv[1].endsWith('dev_seed.js') ||
      process.argv[1].includes('dev_seed'))
);

if (isDirectCli) {
  runDevSeed()
    .then(() => {
      console.log('[Omnicore Seed CLI] Seeding completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Omnicore Seed Fatal]', err.message || err);
      process.exit(1);
    });
}
