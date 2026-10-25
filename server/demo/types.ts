import type { Express } from 'express';
import type { AuthUser } from '../auth/userRepository.ts';

export type DemoRole = 'PROVIDER' | 'BILLER';
export interface DemoFixture {
  id: 'ready-review' | 'missing-evidence' | 'unknown-date';
  label: string;
  description: string;
}
export interface DemoLimits {
  maxSandboxes: number;
  ttlMs: number;
  idleMs: number;
  maxPolls: number;
  maxRetriesPerCase: number;
  bodyBytes: number;
  maxStorageBytes: number;
  startsPerMinute: number;
  resetsPerHour: number;
  mutationsPerMinute: number;
  readsPerMinute: number;
  requestsPerMinute: number;
}
export interface PublicDemoLimits {
  maxSandboxes: number;
  ttlMinutes: number;
  idleMinutes: number;
  maxPolls: number;
  maxRetriesPerCase: number;
}
export interface DemoSessionInfo {
  user: AuthUser;
  expiresAt: string;
  idleExpiresAt: string;
  sandboxId: string;
  fixtures: DemoFixture[];
  limits: PublicDemoLimits;
}
export interface DemoSessionResponse extends DemoSessionInfo {
  token: string;
}
export interface DemoOptions {
  dataDir: string;
  encryptionKey: string;
  now?: () => number;
  limits?: Partial<DemoLimits>;
  clientDistPath?: string;
}
export interface DemoRuntime {
  app: Express;
  sweep(): Promise<void>;
  close(): Promise<void>;
}

export const DEFAULT_DEMO_LIMITS: Readonly<DemoLimits> = Object.freeze({
  maxSandboxes: 4,
  ttlMs: 30 * 60_000,
  idleMs: 15 * 60_000,
  maxPolls: 1,
  maxRetriesPerCase: 2,
  bodyBytes: 16 * 1024,
  maxStorageBytes: 64 * 1024 * 1024,
  startsPerMinute: 6,
  resetsPerHour: 4,
  mutationsPerMinute: 30,
  readsPerMinute: 120,
  requestsPerMinute: 240,
});
