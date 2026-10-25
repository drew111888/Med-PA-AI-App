/**
 * Public synthetic-demo HTTP acceptance boundary.
 *
 * These tests use real HTTP and separate disposable stores. They deliberately
 * exercise identical canonical case IDs in two tester sessions: a visually
 * separate login is insufficient unless the persisted case/artifact state is
 * isolated too. No live EHR, model, payer, or user document is used.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoApp } from './index.ts';

type Options = Parameters<typeof createDemoApp>[0];
type Envelope = {
  token: string;
  user: { id: string; name: string; role: 'PROVIDER' | 'BILLER' };
  expiresAt: string;
  idleExpiresAt: string;
  sandboxId: string;
  fixtures: Array<{ id: string } | string>;
  limits: Record<string, number>;
};
type ResponseData = { status: number; body: any; text: string; headers: Headers };
type Running = {
  base: string;
  dataDir: string;
  key: string;
  gateway: ReturnType<typeof createDemoApp>;
  stop: () => Promise<void>;
};

const stores: string[] = [];
const running: Running[] = [];
// Synthetic test key only. Tests must never read host credentials or real data.
const TEST_KEY = 'synthetic-http-acceptance-encryption-key';
const CASE = 'case_den_001';

async function launch(overrides: Partial<Options> = {}, existingDir?: string): Promise<Running> {
  const dataDir = existingDir ?? await mkdtemp(join(tmpdir(), 'medauth-demo-http-'));
  if (!existingDir) stores.push(dataDir);
  const gateway = createDemoApp({ dataDir, encryptionKey: TEST_KEY, ...overrides });
  const server = gateway.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test listener did not provide a port');
  let stopped = false;
  const result: Running = {
    base: `http://127.0.0.1:${address.port}`,
    dataDir,
    key: TEST_KEY,
    gateway,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await gateway.close();
    },
  };
  running.push(result);
  return result;
}

async function api(
  host: Running,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ResponseData> {
  const response = await fetch(host.base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: response.status, body: parsed, text, headers: response.headers };
}

async function start(host: Running, role: 'PROVIDER' | 'BILLER' = 'PROVIDER'): Promise<Envelope> {
  const response = await api(host, 'POST', '/api/demo/start', undefined, { role });
  expect(response.status).toBe(201);
  expect(typeof response.body.token).toBe('string');
  expect(response.body.token.length > 24).toBe(true);
  expect(response.body.user.role).toBe(role);
  expect(JSON.stringify(response.body.user)).not.toMatch(/password|secret|token_hash/i);
  return response.body;
}

async function intake(host: Running, token: string, fixtureId = 'ready-review'): Promise<ResponseData> {
  return api(host, 'POST', '/api/demo/intake', token, { fixtureId });
}

async function detail(host: Running, token: string, caseId = CASE): Promise<any> {
  const response = await api(host, 'GET', `/api/cases/${caseId}`, token);
  expect(response.status).toBe(200);
  return response.body.case;
}

async function approve(host: Running, token: string, caseId = CASE): Promise<number> {
  const c = await detail(host, token, caseId);
  const response = await api(host, 'POST', `/api/cases/${caseId}/approve`, token, { packetVersion: c.packetVersion });
  expect(response.status).toBe(200);
  return c.packetVersion;
}

function expectPrivate(response: ResponseData): void {
  expect(response.headers.get('cache-control') ?? '').toMatch(/no-store/i);
}

afterEach(async () => {
  for (const host of running.splice(0).reverse()) await host.stop();
  for (const path of stores.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('public demo — authenticated tester isolation', () => {
  it('starts a blank authenticated sandbox, identifies its role, and rejects unauthenticated reads', async () => {
    const host = await launch();
    const session = await start(host);
    const fixtures = session.fixtures.map((item) => typeof item === 'string' ? item : item.id);
    expect(fixtures).toEqual(expect.arrayContaining(['ready-review', 'missing-evidence', 'unknown-date']));
    const anonymous = await api(host, 'GET', '/api/cases');
    expect(anonymous.status).toBe(401);
    const identified = await api(host, 'GET', '/api/demo/session', session.token);
    expect(identified.status).toBe(200);
    expect(identified.body.sandboxId).toBe(session.sandboxId);
    expect(identified.body.user.role).toBe('PROVIDER');
    expect(identified.body.token).toBeUndefined();
    expectPrivate(identified);
    const list = await api(host, 'GET', '/api/cases', session.token);
    expect(list.status).toBe(200);
    expect(list.body.cases).toEqual([]);
    expect((await api(host, 'POST', '/api/auth/logout', session.token, {})).status).toBe(200);
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(401);
  });

  it('isolates identical case IDs through approval, artifact download, receipt, and reset', async () => {
    const host = await launch();
    const a = await start(host);
    const b = await start(host);
    expect(a.sandboxId === b.sandboxId).toBe(false);
    expect(a.token === b.token).toBe(false);
    expect((await intake(host, a.token)).status).toBe(200);
    expect((await intake(host, b.token)).status).toBe(200);

    await approve(host, a.token);
    expect((await detail(host, a.token)).state).toBe('approved');
    expect((await detail(host, b.token)).state).toBe('packet_ready');
    const handoffA = await api(host, 'POST', `/api/cases/${CASE}/handoff`, a.token, {});
    expect(handoffA.status).toBe(200);
    const downloadA = await api(host, 'GET', `/api/cases/${CASE}/handoff`, a.token);
    expect(downloadA.status).toBe(200);
    expect(downloadA.body.caseId).toBe(CASE);
    expectPrivate(downloadA);
    expect((await api(host, 'GET', `/api/cases/${CASE}/handoff`, b.token)).status).toBe(404);

    const submitted = await api(host, 'POST', `/api/cases/${CASE}/submit`, a.token, {});
    expect(submitted.status).toBe(200);
    expect((await detail(host, b.token)).state).toBe('packet_ready');
    expect((await api(host, 'GET', `/api/cases/${CASE}/receipt`, b.token)).status).toBe(404);

    const reset = await api(host, 'POST', '/api/demo/reset', a.token, {});
    expect(reset.status).toBe(200);
    expect(reset.body.token === a.token).toBe(false);
    expect((await api(host, 'GET', '/api/cases', a.token)).status).toBe(401);
    const resetList = await api(host, 'GET', '/api/cases', reset.body.token);
    expect(resetList.status).toBe(200);
    expect(resetList.body.cases).toEqual([]);
    expect((await detail(host, b.token)).state).toBe('packet_ready');
    const attemptSelectOther = await api(host, 'GET', '/api/demo/session', b.token, undefined, { 'x-sandbox-id': reset.body.sandboxId });
    expect(attemptSelectOther.status).toBe(403);
    const stillB = await api(host, 'GET', '/api/demo/session', b.token);
    expect(stillB.body.sandboxId).toBe(b.sandboxId);
    expect((await api(host, 'POST', '/api/auth/logout', reset.body.token, {})).status).toBe(200);
    expect((await detail(host, b.token)).state).toBe('packet_ready');
  });

  it('enforces BILLER on the server, rejects ADMIN, and revokes previous role sessions', async () => {
    const host = await launch();
    const biller = await start(host, 'BILLER');
    expect((await intake(host, biller.token)).status).toBe(200);
    const c = await detail(host, biller.token);
    // Use the legitimate body here so a 403 proves core RBAC, rather than just
    // the gateway's independent rejection of undocumented body fields.
    expect((await api(host, 'POST', `/api/cases/${CASE}/approve`, biller.token, { packetVersion: c.packetVersion })).status).toBe(403);
    const admin = await api(host, 'POST', '/api/demo/role', biller.token, { role: 'ADMIN' });
    expect(admin.status >= 400 && admin.status < 500).toBe(true);
    expect((await api(host, 'GET', '/api/demo/session', biller.token)).body.user.role).toBe('BILLER');
    const provider = await api(host, 'POST', '/api/demo/role', biller.token, { role: 'PROVIDER' });
    expect(provider.status).toBe(200);
    expect(provider.body.user.role).toBe('PROVIDER');
    expect((await api(host, 'GET', '/api/cases', biller.token)).status).toBe(401);
    await approve(host, provider.body.token);
    const forgedStart = await api(host, 'POST', '/api/demo/start', undefined, { role: 'ADMIN' });
    expect(forgedStart.status >= 400 && forgedStart.status < 500).toBe(true);
  });
});

describe('public demo — fixed synthetic workflow only', () => {
  it('rejects raw login/intake, admin routes, unknown APIs, and encoded bypass attempts', async () => {
    const host = await launch();
    const session = await start(host);
    for (const path of [
      '/api/auth/login', '/api/intake/pdf', '/api/auth%2Flogin', '/api/intake%2Fpdf',
      '/api//auth/login', '/api//intake/pdf', '/api/demo/admin', '/api/dev/denials', '/api/not-a-route',
    ]) {
      const response = await api(host, 'POST', path, session.token, { text: 'FORBIDDEN_FREEFORM_SENTINEL', role: 'ADMIN' });
      expect(response.status >= 400 && response.status < 500, path).toBe(true);
      expect(response.text.includes('FORBIDDEN_FREEFORM_SENTINEL')).toBe(false);
      expect(response.text.includes(host.dataDir)).toBe(false);
      expect(response.text.includes(host.key)).toBe(false);
    }
    expect((await api(host, 'GET', '/api/cases', session.token)).body.cases).toEqual([]);
    expect((await api(host, 'GET', '/api/jobs', session.token)).body.jobs).toEqual([]);
  });

  it('rejects foreign IDs and extra intake text instead of storing arbitrary documents', async () => {
    const host = await launch();
    const session = await start(host);
    for (const body of [
      { fixtureId: '../outside' }, { fixtureId: '/etc/passwd' }, { fixtureId: '%2e%2e%2foutside' }, { fixtureId: 'not-a-fixture' },
      { fixtureId: 'ready-review', text: 'FORBIDDEN_FREEFORM_SENTINEL' },
      { fixtureId: 'ready-review', denialId: 'caller-chosen-record' },
    ]) {
      const response = await api(host, 'POST', '/api/demo/intake', session.token, body);
      expect(response.status >= 400 && response.status < 500).toBe(true);
      expect(response.text.includes(host.dataDir)).toBe(false);
      expect(response.text.includes(host.key)).toBe(false);
    }
    const result = await api(host, 'POST', '/api/run/denial/caller-chosen-record', session.token, {});
    expect(result.status >= 400 && result.status < 500).toBe(true);
    expect((await api(host, 'GET', '/api/cases', session.token)).body.cases).toEqual([]);
  });

  it('rejects non-JSON request bodies before a fixed fixture can execute', async () => {
    const host = await launch({ limits: { bodyBytes: 2048 } });
    const session = await start(host);
    const unsupported = await fetch(host.base + '/api/demo/intake/ready-review', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'text/plain' },
      body: 'FORBIDDEN_FREEFORM_SENTINEL',
    });
    expect(unsupported.status).toBe(415);
    const text = await unsupported.text();
    expect(text).not.toContain('FORBIDDEN_FREEFORM_SENTINEL');
    const oversized = await fetch(host.base + '/api/demo/intake/ready-review', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/octet-stream' },
      body: 'x'.repeat(3000),
    });
    expect(oversized.status === 413 || oversized.status === 415).toBe(true);
    await oversized.text();
    expect((await api(host, 'GET', '/api/cases', session.token)).body.cases).toEqual([]);
    expect((await api(host, 'GET', '/api/jobs', session.token)).body.jobs).toEqual([]);
  });

  it('holds an unknown-date fixture before AI/approval and retains unknown deadline attention', async () => {
    const host = await launch();
    const session = await start(host);
    const result = await intake(host, session.token, 'unknown-date');
    expect(result.status).toBe(200);
    const list = await api(host, 'GET', '/api/cases', session.token);
    expect(list.body.cases.length).toBe(1);
    const c = await detail(host, session.token, list.body.cases[0].id);
    expect(c.state).toBe('needs_review');
    expect(c.classification.appealDeadline).toBeNull();
    expect(c.classification.deadlineStatus).toBe('unknown_missing_date');
    expect(c.packet).toBeNull();
    // There is no packet version yet (0). Send a well-formed positive version
    // to exercise the held-case gate rather than the input-validation boundary.
    expect((await api(host, 'POST', `/api/cases/${c.id}/approve`, session.token, { packetVersion: 1 })).status).toBe(409);
    expect((await api(host, 'POST', `/api/cases/${c.id}/handoff`, session.token, {})).status).toBe(409);
    const summary = await api(host, 'GET', '/api/summary', session.token);
    expect(summary.body.unknownDeadlines.some((item: any) => item.caseId === c.id && item.daysRemaining === null)).toBe(true);
    const unavailableRetry = await api(host, 'POST', `/api/cases/${c.id}/retry`, session.token, {});
    expect(unavailableRetry.status).toBe(403);
  });

  it('requires the reviewed version and a handoff, then generates a synthetic receipt without accepting text', async () => {
    const host = await launch();
    const session = await start(host);
    expect((await intake(host, session.token)).status).toBe(200);
    const c = await detail(host, session.token);
    const invalidVersion = await api(host, 'POST', `/api/cases/${CASE}/approve`, session.token, { packetVersion: 0 });
    expect(invalidVersion.status).toBe(400);
    const stale = await api(host, 'POST', `/api/cases/${CASE}/approve`, session.token, { packetVersion: c.packetVersion + 1 });
    expect(stale.status).toBe(409);
    expect((await detail(host, session.token)).state).toBe('packet_ready');
    const approvals = await Promise.all(Array.from({ length: 2 }, () =>
      api(host, 'POST', `/api/cases/${CASE}/approve`, session.token, { packetVersion: c.packetVersion }),
    ));
    expect(approvals.filter((item) => item.status === 200).length).toBe(1);
    expect(approvals.filter((item) => item.status === 409).length).toBe(1);
    const afterApproval = await api(host, 'GET', `/api/cases/${CASE}`, session.token);
    const approvedEvents = afterApproval.body.audit.filter((event: any) => event.action === 'approved');
    expect(approvedEvents.length).toBe(1);
    expect(approvedEvents[0].actor).toBe(session.user.id);
    expect((await api(host, 'POST', `/api/cases/${CASE}/submit`, session.token, {})).status).toBe(409);
    expect((await api(host, 'POST', `/api/cases/${CASE}/handoff`, session.token, {})).status).toBe(200);
    const middle = await api(host, 'GET', '/api/summary', session.token);
    expect(middle.body.submitted).toBe(0);
    expect(middle.body.handoffGenerated).toBe(1);
    const rawReceipt = await api(host, 'POST', `/api/cases/${CASE}/submit`, session.token, {
      channel: 'caller-value', confirmationNumber: 'FORBIDDEN_FREEFORM_SENTINEL', note: 'FORBIDDEN_FREEFORM_SENTINEL',
    });
    expect(rawReceipt.status >= 400 && rawReceipt.status < 500).toBe(true);
    expect((await detail(host, session.token)).state).toBe('handoff_generated');
    expect((await api(host, 'POST', `/api/cases/${CASE}/submit`, session.token, {})).status).toBe(200);
    const receipt = await api(host, 'GET', `/api/cases/${CASE}/receipt`, session.token);
    expect(receipt.status).toBe(200);
    expect(receipt.body.confirmationNumber).toMatch(/DEMO|SYNTHETIC/i);
    expect(receipt.body.recordedBy).toBe(session.user.id);
    expect(receipt.text).not.toContain('FORBIDDEN_FREEFORM_SENTINEL');
    expect((await detail(host, session.token)).state).toBe('submitted');
    expect((await api(host, 'POST', `/api/cases/${CASE}/submit`, session.token, {})).status).toBe(409);
  });
});

describe('public demo — bounded resources and lifecycle', () => {
  it('logout frees only its own capacity and permits a fresh tester immediately', async () => {
    const host = await launch({ limits: { maxSandboxes: 1 } });
    const first = await start(host);
    expect((await intake(host, first.token)).status).toBe(200);
    expect((await api(host, 'POST', '/api/auth/logout', first.token, {})).status).toBe(200);
    expect((await api(host, 'GET', '/api/demo/session', first.token)).status).toBe(401);
    const next = await start(host);
    expect(next.sandboxId === first.sandboxId).toBe(false);
    expect((await api(host, 'GET', '/api/cases', next.token)).body.cases).toEqual([]);
  });

  it('caps active sandboxes and rejects excess starts with 429', async () => {
    const host = await launch({ limits: { maxSandboxes: 2, startsPerMinute: 20 } });
    await start(host);
    await start(host);
    const excess = await api(host, 'POST', '/api/demo/start', undefined, { role: 'PROVIDER' });
    expect(excess.status).toBe(429);
    expect(Number(excess.headers.get('retry-after')) > 0).toBe(true);
  });

  it('rate-limits public bootstrap even when sandbox capacity remains', async () => {
    const host = await launch({ limits: { maxSandboxes: 4, startsPerMinute: 1 } });
    await start(host);
    const excess = await api(host, 'POST', '/api/demo/start', undefined, { role: 'BILLER' });
    expect(excess.status).toBe(429);
    expect(Number(excess.headers.get('retry-after')) > 0).toBe(true);
  });

  it('refuses to allocate a sandbox when its disposable storage budget is exhausted', async () => {
    const host = await launch({ limits: { maxStorageBytes: 1 } });
    const excess = await api(host, 'POST', '/api/demo/start', undefined, { role: 'PROVIDER' });
    expect(excess.status).toBe(429);
    expect(Number(excess.headers.get('retry-after')) > 0).toBe(true);
    expect(excess.text.includes(host.dataDir)).toBe(false);
    expect(excess.text.includes(host.key)).toBe(false);
  });

  it('limits read bursts with a safe 429 response and recovers after the rate window', async () => {
    let clock = Date.parse('2026-11-28T12:00:00Z');
    const host = await launch({ now: () => clock, limits: { readsPerMinute: 2 } });
    const session = await start(host);
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(200);
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(200);
    const excess = await api(host, 'GET', '/api/demo/session', session.token);
    expect(excess.status).toBe(429);
    expect(Number(excess.headers.get('retry-after')) > 0).toBe(true);
    expect(typeof excess.body.error).toBe('string');
    expect(excess.text.includes(host.dataDir)).toBe(false);
    expect(excess.text.includes(host.key)).toBe(false);
    expectPrivate(excess);
    clock += 60_001;
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(200);
  });

  it('limits total API traffic independently of the mutation and read budgets', async () => {
    const host = await launch({ limits: { requestsPerMinute: 2, readsPerMinute: 100 } });
    const session = await start(host);
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(200);
    const excess = await api(host, 'GET', '/api/cases', session.token);
    expect(excess.status).toBe(429);
    expect(Number(excess.headers.get('retry-after')) > 0).toBe(true);
    expectPrivate(excess);
  });

  it('allows only one concurrent discovery and never creates duplicate fixture cases', async () => {
    const host = await launch({ limits: { maxPolls: 1, mutationsPerMinute: 100 } });
    const session = await start(host);
    const responses = await Promise.all(Array.from({ length: 3 }, () => api(host, 'POST', '/api/run/poll', session.token, {})));
    expect(responses.filter((item) => item.status === 200).length).toBe(1);
    expect(responses.filter((item) => item.status === 409 || item.status === 429).length).toBe(2);
    const cases = (await api(host, 'GET', '/api/cases', session.token)).body.cases;
    expect(cases.length).toBe(3);
    expect(new Set(cases.map((c: any) => c.id)).size).toBe(3);
    const repeated = await api(host, 'POST', '/api/run/poll', session.token, {});
    expect(repeated.status).toBe(429);
    const jobs = (await api(host, 'GET', '/api/jobs', session.token)).body.jobs;
    expect(jobs.length).toBeLessThanOrEqual(4);
  });

  it('caps held-case retries and applies a mutation rate limit', async () => {
    const host = await launch({ limits: { maxRetriesPerCase: 1, mutationsPerMinute: 100 } });
    const session = await start(host);
    expect((await intake(host, session.token, 'missing-evidence')).status).toBe(200);
    const first = await api(host, 'POST', '/api/cases/case_den_003/retry', session.token, {});
    expect(first.status).toBe(200);
    expect(first.body.state).toBe('needs_more_data');
    const excess = await api(host, 'POST', '/api/cases/case_den_003/retry', session.token, {});
    expect(excess.status).toBe(429);
    const limited = await launch({ limits: { mutationsPerMinute: 1 } });
    const other = await start(limited);
    expect((await intake(limited, other.token)).status).toBe(200);
    const afterBudget = await api(limited, 'POST', `/api/cases/${CASE}/approve`, other.token, { packetVersion: 1 });
    expect(afterBudget.status).toBe(429);
  });

  it('expires sessions using the injected clock, frees capacity, and caps resets', async () => {
    let clock = Date.parse('2026-11-28T12:00:00Z');
    const host = await launch({ now: () => clock, limits: { ttlMs: 60_000, idleMs: 60_000, maxSandboxes: 1, resetsPerHour: 1 } });
    const session = await start(host);
    const reset = await api(host, 'POST', '/api/demo/reset', session.token, {});
    expect(reset.status).toBe(200);
    expect((await api(host, 'POST', '/api/demo/reset', reset.body.token, {})).status).toBe(429);
    clock += 60_001;
    expect((await api(host, 'GET', '/api/cases', reset.body.token)).status).toBe(401);
    await host.gateway.sweep();
    const fresh = await start(host);
    expect(fresh.sandboxId === session.sandboxId).toBe(false);
  });

  it('refreshes idle activity but expires an inactive tester before its absolute TTL', async () => {
    let clock = Date.parse('2026-11-28T12:00:00Z');
    const host = await launch({ now: () => clock, limits: { ttlMs: 60_000, idleMs: 10_000 } });
    const session = await start(host);
    clock += 9_000;
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(200);
    clock += 9_000;
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(200);
    clock += 10_001;
    expect((await api(host, 'GET', '/api/demo/session', session.token)).status).toBe(401);
  });

  it('reopens the persistent registry without losing ownership, mutations, or revoked-token status', async () => {
    const host = await launch();
    const a = await start(host);
    const b = await start(host);
    expect((await intake(host, a.token)).status).toBe(200);
    expect((await intake(host, b.token)).status).toBe(200);
    await approve(host, a.token);
    const switched = await api(host, 'POST', '/api/demo/role', b.token, { role: 'BILLER' });
    expect(switched.status).toBe(200);
    await host.stop();
    const reopened = await launch({}, host.dataDir);
    expect((await detail(reopened, a.token)).state).toBe('approved');
    expect((await api(reopened, 'GET', '/api/cases', b.token)).status).toBe(401);
    expect((await detail(reopened, switched.body.token)).state).toBe('packet_ready');
    expect((await api(reopened, 'GET', `/api/cases/${CASE}/handoff`, switched.body.token)).status).toBe(404);
    const identity = await api(reopened, 'GET', '/api/demo/session', a.token);
    expect(identity.body.sandboxId).toBe(a.sandboxId);
  });

  it('repeated expiry cleanup permits bounded reuse across registry reopen', async () => {
    let clock = Date.parse('2026-11-28T12:00:00Z');
    const options: Partial<Options> = {
      now: () => clock,
      limits: {
        maxSandboxes: 1, ttlMs: 1_000, idleMs: 1_000,
        startsPerMinute: 100, maxStorageBytes: 8 * 1024 * 1024,
      },
    };
    let host = await launch(options);
    let expiredToken = '';
    for (let cycle = 0; cycle < 20; cycle++) {
      const session = await start(host);
      expiredToken = session.token;
      clock += 1_001;
      await host.gateway.sweep();
      if (cycle === 9) {
        await host.stop();
        host = await launch(options, host.dataDir);
      }
    }
    expect((await api(host, 'GET', '/api/cases', expiredToken)).status).toBe(401);
    const fresh = await start(host);
    expect((await api(host, 'GET', '/api/cases', fresh.token)).body.cases).toEqual([]);
  }, 30_000);

  it('rejects oversized, malformed, and mistyped requests without internal paths or secrets', async () => {
    const host = await launch({ limits: { bodyBytes: 2048 } });
    const session = await start(host);
    const large = await api(host, 'POST', '/api/demo/intake', session.token, { fixtureId: 'ready-review', text: 'x'.repeat(3000) });
    expect(large.status).toBe(413);
    const malformedResponse = await fetch(host.base + '/api/demo/role', {
      method: 'POST', headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' }, body: '{bad-json',
    });
    const malformedText = await malformedResponse.text();
    expect(malformedResponse.status).toBe(400);
    const malformedRole = await api(host, 'POST', '/api/demo/role', session.token, { role: { value: 'PROVIDER' } });
    expect(malformedRole.status >= 400 && malformedRole.status < 500).toBe(true);
    for (const responseText of [large.text, malformedText, malformedRole.text]) {
      expect(responseText.includes(host.dataDir)).toBe(false);
      expect(responseText.includes(host.key)).toBe(false);
      expect(responseText).not.toMatch(/node_modules|SqliteError|at .*\.ts:\d+/);
    }
  });
});
