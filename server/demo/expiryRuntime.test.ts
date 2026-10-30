/**
 * Real-clock expiry acceptance over actual loopback HTTP and disposable SQLite.
 *
 * No injected `now`, mocked Date, or fake timers are used. Shortened factory
 * limits keep this regression bounded; this is not a 15/30-minute default-limit
 * soak or browser-expiry test. Production configuration is never changed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { createDemoApp } from './index.ts';

type Limits = NonNullable<Parameters<typeof createDemoApp>[0]['limits']>;
type Session = { token: string; sandboxId: string; expiresAt: string; idleExpiresAt: string };
type Running = {
  base: string;
  dataDir: string;
  stop: () => Promise<void>;
};

// Existing non-host fixture from demo.test.ts; no live key or user data is read.
const TEST_KEY = 'synthetic-http-acceptance-encryption-key';
const hosts: Running[] = [];
const stores: string[] = [];

async function launch(limits: Limits): Promise<Running> {
  const dataDir = await mkdtemp(join(tmpdir(), 'medauth-expiry-runtime-'));
  stores.push(dataDir);
  const runtime = createDemoApp({ dataDir, encryptionKey: TEST_KEY, limits });
  const server = runtime.app.listen(0, '127.0.0.1');
  let stopped = false;
  const host: Running = {
    base: '', dataDir,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        server.closeAllConnections();
        if (server.listening) {
          await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
      } finally { await runtime.close(); }
    },
  };
  hosts.push(host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback expiry-test port');
  host.base = `http://127.0.0.1:${address.port}`;
  return host;
}

async function api(host: Running, path: string, token?: string, body?: unknown) {
  const response = await fetch(host.base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any, headers: response.headers };
}

async function start(host: Running, role: 'PROVIDER' | 'BILLER' = 'PROVIDER'): Promise<Session> {
  const response = await api(host, '/api/demo/start', undefined, { role });
  // Assert scalars/booleans only: failure diagnostics must not print bearers.
  expect(response.status).toBe(201);
  expect(typeof response.body.token === 'string' && response.body.token.length > 24).toBe(true);
  return response.body;
}

afterEach(async () => {
  try {
    for (const host of hosts.splice(0).reverse()) await host.stop();
  } finally {
    for (const store of stores.splice(0)) await rm(store, { recursive: true, force: true });
  }
});

describe('synthetic gateway — fresh real-clock expiry', () => {
  it('refreshes idle activity but cannot extend absolute expiry, then reclaims its slot', async () => {
    const idleMs = 1_200;
    const host = await launch({ ttlMs: 3_500, idleMs, maxSandboxes: 1 });
    const session = await start(host);
    const absoluteExpiry = Date.parse(session.expiresAt);
    const first = await api(host, '/api/demo/session', session.token);
    expect(first.status).toBe(200);
    const initialIdleExpiry = Date.parse(first.body.idleExpiresAt);
    let lastAuthorizedAt = Date.now();
    let idleExtended = false;
    let successfulReads = 1;
    let expiredResponse: Awaited<ReturnType<typeof api>> | undefined;
    // A monotonic deadline bounds failure even if the system wall clock changes.
    const deadline = performance.now() + 5_500;
    while (performance.now() < deadline) {
      await delay(100);
      const response = await api(host, '/api/demo/session', session.token);
      if (response.status === 401) { expiredResponse = response; break; }
      expect(response.status).toBe(200);
      expect(response.body.expiresAt).toBe(session.expiresAt);
      successfulReads++;
      lastAuthorizedAt = Date.now();
      idleExtended ||= Date.parse(response.body.idleExpiresAt) > initialIdleExpiry;
    }
    expect(expiredResponse !== undefined).toBe(true);
    expect(expiredResponse?.body.code).toBe('demo_session_expired');
    expect(expiredResponse?.headers.get('cache-control')?.includes('no-store')).toBe(true);
    expect(successfulReads >= 3).toBe(true);
    expect(idleExtended).toBe(true);
    expect(Date.now() >= absoluteExpiry).toBe(true);
    expect(Date.now() - lastAuthorizedAt < idleMs).toBe(true);
    expect((await api(host, '/api/cases', session.token)).status).toBe(401);
    expect(existsSync(join(host.dataDir, 'sandboxes', session.sandboxId))).toBe(false);
    const fresh = await start(host);
    expect(fresh.sandboxId === session.sandboxId).toBe(false);
    const list = await api(host, '/api/cases', fresh.token);
    expect(list.status).toBe(200);
    expect(list.body.cases.length).toBe(0);
  }, 10_000);

  it('expires an idle tester before TTL while another remains active and keeps its case', async () => {
    const host = await launch({ ttlMs: 8_000, idleMs: 1_200, maxSandboxes: 2 });
    const idle = await start(host);
    const active = await start(host, 'BILLER');
    expect(active.sandboxId === idle.sandboxId).toBe(false);
    expect((await api(host, '/api/demo/intake', active.token, { fixtureId: 'ready-review' })).status).toBe(200);
    const idleIdentity = await api(host, '/api/demo/session', idle.token);
    expect(idleIdentity.status).toBe(200);
    const idleDeadline = Date.parse(idleIdentity.body.idleExpiresAt);
    const capacity = await api(host, '/api/demo/start', undefined, { role: 'PROVIDER' });
    expect(capacity.status).toBe(429);
    expect(capacity.body.code).toBe('demo_capacity');

    const monotonicDeadline = performance.now() + 4_000;
    let activeReads = 0;
    while (Date.now() <= idleDeadline + 120 && performance.now() < monotonicDeadline) {
      const response = await api(host, '/api/demo/session', active.token);
      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('BILLER');
      activeReads++;
      await delay(100);
    }
    expect(Date.now() > idleDeadline).toBe(true);
    expect(Date.now() < Date.parse(idle.expiresAt)).toBe(true);
    expect(activeReads >= 3).toBe(true);
    const expired = await api(host, '/api/demo/session', idle.token);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('demo_session_expired');
    expect((await api(host, '/api/demo/intake', idle.token, { fixtureId: 'ready-review' })).status).toBe(401);
    expect(existsSync(join(host.dataDir, 'sandboxes', idle.sandboxId))).toBe(false);
    expect(existsSync(join(host.dataDir, 'sandboxes', active.sandboxId))).toBe(true);
    const retained = await api(host, '/api/cases/case_den_001', active.token);
    expect(retained.status).toBe(200);
    expect(retained.body.case.state).toBe('packet_ready');
    const fresh = await start(host);
    expect(fresh.sandboxId === idle.sandboxId || fresh.sandboxId === active.sandboxId).toBe(false);
    const empty = await api(host, '/api/cases', fresh.token);
    expect(empty.status).toBe(200);
    expect(empty.body.cases.length).toBe(0);
    expect((await api(host, '/api/cases/case_den_001', active.token)).status).toBe(200);
  }, 10_000);
});
