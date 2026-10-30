/**
 * Concurrent independent HTTP clients, real gateway and disposable SQLite.
 *
 * Existing demo coverage exercises sequential tester isolation. These checks
 * issue requests from different bearer sessions together, including lifecycle
 * changes while another client reads or retries. The gateway deliberately
 * serializes mutations: a documented demo_busy response is reconciled once
 * after both concurrent responses settle, never mistaken for lost isolation.
 * This is transport/runtime coverage, not browser or simultaneous DB-write proof.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoApp } from './index.ts';

type Session = { token: string; sandboxId: string; user: { role: 'PROVIDER' | 'BILLER' } };
type Reply = { status: number; body: any };
type Host = { base: string; dataDir: string; stop: () => Promise<void> };
const hosts: Host[] = [];
const stores: string[] = [];
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
// Existing non-host synthetic fixture; no owner/live key or credential is read.
const TEST_KEY = 'synthetic-http-acceptance-encryption-key';
const READY = '/api/cases/case_den_001';
const HELD = '/api/cases/case_den_003';

async function launch(): Promise<Host> {
  const dataDir = await mkdtemp(join(tmpdir(), 'medauth-concurrent-clients-'));
  stores.push(dataDir);
  const gateway = createDemoApp({ dataDir, encryptionKey: TEST_KEY });
  let server: ReturnType<typeof gateway.app.listen> | undefined;
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      const owned = server;
      if (owned?.listening) {
        owned.closeAllConnections();
        await new Promise<void>((resolve, reject) => owned.close(error => error ? reject(error) : resolve()));
      }
    } finally { await gateway.close(); }
  };
  try {
    server = gateway.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No owned loopback listener');
    const host: Host = { base: `http://127.0.0.1:${address.port}`, dataDir, stop };
    hosts.push(host);
    return host;
  } catch (error) {
    try { await stop(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Owned HTTP test startup and cleanup failed'); }
    throw error;
  }
}

async function api(host: Host, method: string, route: string, token?: string, body?: unknown): Promise<Reply> {
  const response = await fetch(host.base + route, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function start(host: Host, role: Session['user']['role']): Promise<Session> {
  const result = await api(host, 'POST', '/api/demo/start', undefined, { role });
  expect(result.status).toBe(201);
  // Boolean assertions cannot print bearer values as failure diffs.
  expect(typeof result.body.token === 'string' && result.body.token.length > 24).toBe(true);
  expect(result.body.user.role).toBe(role);
  return result.body;
}

async function reconcileBusy(
  initial: Reply,
  request: () => Promise<Reply>,
  expectedStatus = 200,
): Promise<Reply> {
  const response = initial.status === 409 && initial.body.code === 'demo_busy'
    ? await request()
    : initial;
  expect(response.status).toBe(expectedStatus);
  return response;
}

async function together(
  requests: [() => Promise<Reply>, () => Promise<Reply>],
  expected: [number, number] = [200, 200],
): Promise<[Reply, Reply]> {
  // Both real HTTP requests are initiated before awaiting either response.
  const initial = await Promise.all(requests.map(request => request()));
  // Reconcile serially only after the two in-flight responses are complete.
  return [
    await reconcileBusy(initial[0], requests[0], expected[0]),
    await reconcileBusy(initial[1], requests[1], expected[1]),
  ];
}

async function detail(host: Host, session: Session, route: string): Promise<any> {
  const result = await api(host, 'GET', route, session.token);
  expect(result.status).toBe(200);
  return result.body;
}

async function assertSingleDurableCase(host: Host, session: Session, attempts: number): Promise<void> {
  const folder = join(host.dataDir, 'sandboxes', session.sandboxId);
  const generations = await readdir(folder);
  expect(generations.length).toBe(1);
  const db = new DatabaseSync(join(folder, generations[0], 'state.sqlite'), { readOnly: true });
  try {
    for (const table of ['appeal_cases', 'denials', 'jobs']) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(1);
    }
    const jobs = db.prepare('SELECT status, attempts FROM jobs').all() as Array<{ status: string; attempts: number }>;
    expect(jobs).toEqual([{ status: 'done', attempts }]);
    expect(db.prepare('PRAGMA foreign_key_check').all().length).toBe(0);
  } finally { db.close(); }
}

afterEach(async () => {
  const closed = await Promise.allSettled(hosts.splice(0).reverse().map(host => host.stop()));
  const removed = await Promise.allSettled(stores.splice(0).map(store => rm(store, { recursive: true, force: true })));
  const failures = [...closed, ...removed].filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Owned HTTP test cleanup failed');
});

describe('independent tester clients issuing concurrent HTTP requests', () => {
  it('keeps same-ID approval and artifact ownership separate during parallel role-bound requests', async () => {
    const host = await launch();
    const provider = await start(host, 'PROVIDER');
    const biller = await start(host, 'BILLER');
    expect(provider.token === biller.token).toBe(false);
    expect(provider.sandboxId === biller.sandboxId).toBe(false);
    await together([
      () => api(host, 'POST', '/api/demo/intake', provider.token, { fixtureId: 'ready-review' }),
      () => api(host, 'POST', '/api/demo/intake', biller.token, { fixtureId: 'ready-review' }),
    ]);
    const [readyA, readyB] = await Promise.all([detail(host, provider, READY), detail(host, biller, READY)]);
    expect(readyA.case.id).toBe('case_den_001');
    expect(readyB.case.id).toBe('case_den_001');
    expect(readyA.latestJob.id === readyB.latestJob.id).toBe(false);

    await together([
      () => api(host, 'POST', READY + '/approve', provider.token, { packetVersion: readyA.case.packetVersion }),
      () => api(host, 'POST', READY + '/approve', biller.token, { packetVersion: readyB.case.packetVersion }),
    ], [200, 403]);
    const [approvedA, unchangedB] = await Promise.all([detail(host, provider, READY), detail(host, biller, READY)]);
    expect(approvedA.case.state).toBe('approved');
    expect(unchangedB.case.state).toBe('packet_ready');
    expect(unchangedB.case.approvedVersion).toBeNull();

    await together([
      () => api(host, 'POST', READY + '/handoff', provider.token, {}),
      () => api(host, 'GET', READY, biller.token),
    ]);
    const downloads = await Promise.all([
      api(host, 'GET', READY + '/handoff', provider.token),
      api(host, 'GET', READY + '/handoff', biller.token),
    ]);
    expect(downloads.map(result => result.status)).toEqual([200, 404]);
    expect(downloads[0].body.caseId).toBe('case_den_001');
    expect((await detail(host, biller, READY)).case.state).toBe('packet_ready');
    await Promise.all([assertSingleDurableCase(host, provider, 1), assertSingleDurableCase(host, biller, 1)]);
  });

  it('keeps durable jobs and retry budgets isolated across concurrent reset and logout lifecycle changes', async () => {
    const host = await launch();
    const a = await start(host, 'PROVIDER');
    const b = await start(host, 'BILLER');
    await together([
      () => api(host, 'POST', '/api/demo/intake', a.token, { fixtureId: 'missing-evidence' }),
      () => api(host, 'POST', '/api/demo/intake', b.token, { fixtureId: 'missing-evidence' }),
    ]);
    const [initialA, initialB] = await Promise.all([detail(host, a, HELD), detail(host, b, HELD)]);
    expect(initialA.latestJob.id === initialB.latestJob.id).toBe(false);
    const retries = await together([
      () => api(host, 'POST', HELD + '/retry', a.token, {}),
      () => api(host, 'POST', HELD + '/retry', b.token, {}),
    ]);
    expect(retries.map(result => result.body.attempts)).toEqual([2, 2]);
    expect(retries[0].body.jobId).toBe(initialA.latestJob.id);
    expect(retries[1].body.jobId).toBe(initialB.latestJob.id);
    expect((await api(host, 'POST', HELD + '/retry', a.token, {})).status).toBe(200);
    expect((await api(host, 'POST', HELD + '/retry', a.token, {})).status).toBe(429);

    // A exhausted its own budget. Resetting A while B performs its remaining
    // allowed retry must not consume, reset, or redirect B's state/budget.
    const [resetA, finalRetryB] = await together([
      () => api(host, 'POST', '/api/demo/reset', a.token, {}),
      () => api(host, 'POST', HELD + '/retry', b.token, {}),
    ]);
    const nextA = resetA.body as Session;
    expect(nextA.token === a.token).toBe(false);
    expect(nextA.sandboxId === a.sandboxId).toBe(true);
    expect(finalRetryB.body.jobId).toBe(initialB.latestJob.id);
    expect(finalRetryB.body.attempts).toBe(3);
    expect((await api(host, 'GET', '/api/cases', a.token)).status).toBe(401);
    const freshA = await api(host, 'GET', '/api/cases', nextA.token);
    expect(freshA.status).toBe(200);
    expect(freshA.body.cases).toEqual([]);
    expect((await detail(host, b, HELD)).latestJob.id).toBe(initialB.latestJob.id);
    expect((await api(host, 'POST', HELD + '/retry', b.token, {})).status).toBe(429);

    // A's new generation has its own fresh allowance, while B remains capped.
    expect((await api(host, 'POST', '/api/demo/intake', nextA.token, { fixtureId: 'missing-evidence' })).status).toBe(200);
    expect((await api(host, 'POST', HELD + '/retry', nextA.token, {})).status).toBe(200);
    await Promise.all([assertSingleDurableCase(host, nextA, 2), assertSingleDurableCase(host, b, 3)]);
    const beforeLogoutB = await detail(host, b, HELD);
    const [logoutA, concurrentReadB] = await together([
      () => api(host, 'POST', '/api/auth/logout', nextA.token, {}),
      () => api(host, 'GET', HELD, b.token),
    ]);
    expect(logoutA.status).toBe(200);
    expect(concurrentReadB.body.latestJob).toEqual(beforeLogoutB.latestJob);
    expect((await api(host, 'GET', '/api/cases', nextA.token)).status).toBe(401);
    expect((await detail(host, b, HELD)).latestJob).toEqual(beforeLogoutB.latestJob);
    expect((await api(host, 'POST', HELD + '/retry', b.token, {})).status).toBe(429);
    expect((await api(host, 'GET', '/api/auth/me', b.token)).body.user.role).toBe('BILLER');
  });
});
