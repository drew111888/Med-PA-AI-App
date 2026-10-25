/**
 * Seed synthetic users for local development when the users table is empty.
 *
 * SYNTHETIC CREDENTIALS ONLY — for local, synthetic-data development. A real
 * install must create users through an operator flow and must not ship these.
 * Passwords can be overridden via env so they are not hardcoded in production.
 */

import type { UserRepository } from './userRepository.ts';

export interface SeedUser {
  username: string;
  name: string;
  role: 'ADMIN' | 'PROVIDER' | 'BILLER';
  password: string;
}

export const seedUsersIfEmpty = (users: UserRepository): SeedUser[] => {
  if (users.countUsers() > 0) return [];

  // Synthetic-only guard: refuse to seed demo users under a non-synthetic/
  // production signal with no operator-supplied encryption key (mirrors
  // loadConfig's guard). Permissive under explicit local synthetic dev (no
  // production signal). A production signal is never exempted by test-ness.
  const productionSignal =
    process.env.NODE_ENV === 'production' || process.env.MEDAUTH_PROFILE === 'production';
  const hasEncryptionKey = Boolean(process.env.MEDAUTH_DB_ENCRYPTION_KEY);
  if (productionSignal && !hasEncryptionKey) {
    throw new Error(
      'Refusing to seed synthetic demo users: a production signal was set without ' +
        'MEDAUTH_DB_ENCRYPTION_KEY. Create users through an operator flow for non-synthetic runs.',
    );
  }

  const seeds: SeedUser[] = [
    {
      username: 'admin',
      name: 'Local Admin',
      role: 'ADMIN',
      password: process.env.MEDAUTH_SEED_ADMIN_PASSWORD || 'dev-admin-pass',
    },
    {
      username: 'provider',
      name: 'Dr. Synthetic Provider',
      role: 'PROVIDER',
      password: process.env.MEDAUTH_SEED_PROVIDER_PASSWORD || 'dev-provider-pass',
    },
    {
      username: 'coordinator',
      name: 'Synthetic Coordinator',
      role: 'BILLER',
      password: process.env.MEDAUTH_SEED_COORDINATOR_PASSWORD || 'dev-coordinator-pass',
    },
  ];

  for (const s of seeds) users.createUser(s.username, s.name, s.role, s.password);
  return seeds;
};
