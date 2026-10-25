/**
 * Local-First Autonomous Denial Appeal System
 * Centralized server configuration.
 *
 * All configuration is read from the environment exactly once, here. No secret
 * is ever injected into the client bundle. The practice runs this server on a
 * local machine; defaults are chosen so the system boots with zero external
 * dependencies for synthetic-data development.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import path from 'node:path';
import os from 'node:os';

export type EhrAdapterName = 'synthetic' | 'athena';
export type PayerPolicyAdapterName = 'synthetic' | 'fhir-davinci';
export type AiProviderName = 'local' | 'cloud';

export interface AppConfig {
  /** Port the local API server binds to. */
  port: number;
  /** Host interface. Defaults to loopback to keep the system local-only. */
  host: string;
  /** Absolute path to the embedded SQLite database file. */
  dbPath: string;
  /**
   * Encryption key for PHI-at-rest field encryption. In a real deployment this
   * comes from the local OS secret store or an operator-provided passphrase.
   * For synthetic development a deterministic dev key is used.
   */
  dbEncryptionKey: string;
  /** Which EHR adapter the pipeline uses. Synthetic by default. */
  ehrAdapter: EhrAdapterName;
  /** Which payer-policy adapter the rules engine sources from. */
  payerPolicyAdapter: PayerPolicyAdapterName;
  /** Which AI provider the AIProviderPort routes to. Local by default. */
  aiProvider: AiProviderName;
  /** Whether cloud AI providers are permitted at all (requires de-id to pass). */
  allowCloudAi: boolean;
  /** Absolute path to the built client assets (served in production mode). */
  clientDistPath: string;
  /** True when running under a test runner. */
  isTest: boolean;
}

const toInt = (value: string | undefined, fallback: number): number => {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1' || value.toLowerCase() === 'yes';
};

let cached: AppConfig | null = null;

export const loadConfig = (overrides: Partial<AppConfig> = {}): AppConfig => {
  if (cached && Object.keys(overrides).length === 0) return cached;

  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  const defaultDbPath = isTest
    ? ':memory:'
    : path.resolve(process.cwd(), 'data', 'medauth.db');

  const config: AppConfig = {
    port: toInt(process.env.MEDAUTH_PORT, 4000),
    host: process.env.MEDAUTH_HOST || '127.0.0.1',
    dbPath: process.env.MEDAUTH_DB_PATH || defaultDbPath,
    dbEncryptionKey:
      process.env.MEDAUTH_DB_ENCRYPTION_KEY ||
      // Deterministic, clearly-non-production dev key. A real install MUST supply
      // MEDAUTH_DB_ENCRYPTION_KEY from the local OS keychain / operator prompt.
      'DEV-ONLY-INSECURE-KEY-replace-in-production-' + os.hostname(),
    ehrAdapter: (process.env.MEDAUTH_EHR_ADAPTER as EhrAdapterName) || 'synthetic',
    payerPolicyAdapter:
      (process.env.MEDAUTH_PAYER_POLICY_ADAPTER as PayerPolicyAdapterName) || 'synthetic',
    aiProvider: (process.env.MEDAUTH_AI_PROVIDER as AiProviderName) || 'local',
    allowCloudAi: toBool(process.env.MEDAUTH_ALLOW_CLOUD_AI, false),
    clientDistPath: process.env.MEDAUTH_CLIENT_DIST || path.resolve(process.cwd(), 'dist'),
    isTest,
    ...overrides,
  };

  if (Object.keys(overrides).length === 0) cached = config;
  return config;
};

/** Test helper: clear the cached config so a fresh one is built. */
export const resetConfigCache = (): void => {
  cached = null;
};
