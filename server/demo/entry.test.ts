import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TEST_KEY = 'synthetic-entry-check-key-not-a-host-credential';
const directories: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];

const makeDirectory = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medpa-entry-'));
  directories.push(dir);
  return dir;
};

const launch = (env: Record<string, string>) => {
  // The child needs no outbound transport. Keep even a regressed live-adapter
  // selection from contacting an EHR/model during this entry acceptance test.
  const guard = path.join(makeDirectory(), 'deny-outbound.cjs');
  fs.writeFileSync(guard, "globalThis.fetch = async () => { throw new Error('Outbound transport is prohibited in synthetic entry acceptance'); };\n");
  // Ordinary entry checks must not depend on a prior Vite build. The opt-in
  // release-runtime check below supplies the actual built asset directory.
  const clientDir = env.MEDAUTH_CLIENT_DIST ?? makeDirectory();
  if (!env.MEDAUTH_CLIENT_DIST) fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>Synthetic entry fixture</title>');
  const child = spawn(process.execPath, ['--require', guard, '--import', 'tsx', 'server/demoIndex.ts'], {
    cwd: root,
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', MEDAUTH_HOST: '127.0.0.1', MEDAUTH_CLIENT_DIST: clientDir, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = once(child, 'close').then(([code]) => ({ code, output }));
  return { child, exited, output: () => output };
};

const waitReady = (run: ReturnType<typeof launch>): Promise<void> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Demo did not reach local readiness')), 4_000);
  const check = () => {
    if (run.output().includes('gateway started')) { clearTimeout(timeout); resolve(); }
  };
  run.child.stdout.on('data', check);
  void run.exited.then(result => {
    if (!run.output().includes('gateway started')) { clearTimeout(timeout); reject(new Error(`Demo exited before readiness (${result.code})`)); }
  });
  check();
});

const freePort = async (): Promise<number> => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local test port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
};

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill('SIGTERM');
      const fallback = setTimeout(() => child.kill('SIGKILL'), 2_000);
      await closed;
      clearTimeout(fallback);
    }
  }
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('hosted demo entry and deployment environment', () => {
  it('refuses missing or blank keys before creating the data store', async () => {
    for (const key of ['', '   ']) {
      const base = makeDirectory();
      const dataDir = path.join(base, 'store');
      const run = launch({ MEDAUTH_DEMO_DATA_DIR: dataDir, MEDAUTH_DEMO_ENCRYPTION_KEY: key });
      const result = await run.exited;
      expect(result.code).not.toBe(0);
      expect(fs.existsSync(dataDir)).toBe(false);
      expect(result.output.includes('gateway started')).toBe(false);
    }
  });

  it('rejects an invalid platform port without exposing its supplied key or opening a store', async () => {
    const base = makeDirectory();
    const dataDir = path.join(base, 'store');
    const run = launch({ MEDAUTH_DEMO_DATA_DIR: dataDir, MEDAUTH_DEMO_ENCRYPTION_KEY: TEST_KEY, PORT: '65536' });
    const result = await run.exited;
    expect(result.code).not.toBe(0);
    expect(result.output.includes('Invalid hosted demo port')).toBe(true);
    expect(result.output.includes(TEST_KEY)).toBe(false);
    expect(fs.existsSync(dataDir)).toBe(false);
  });

  it('uses Node/TSX, honors PORT, pins synthetic services, and shuts down cleanly', async () => {
    const dataDir = makeDirectory();
    const port = await freePort();
    const run = launch({
      MEDAUTH_DEMO_DATA_DIR: dataDir,
      MEDAUTH_DEMO_ENCRYPTION_KEY: TEST_KEY,
      PORT: String(port),
      MEDAUTH_PORT: '65536', // PORT must take precedence on the host.
      // A demo's adapters must stay pinned even if unrelated environment
      // defaults request live/cloud adapters. No live credentials are supplied.
      MEDAUTH_EHR_ADAPTER: 'athena',
      MEDAUTH_PAYER_POLICY_ADAPTER: 'fhir-davinci',
      MEDAUTH_AI_PROVIDER: 'cloud',
      MEDAUTH_ALLOW_CLOUD_AI: 'true',
    });
    await waitReady(run);
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok', mode: 'synthetic-demo', ehrAdapter: 'synthetic', aiProvider: 'local-stub', allowCloudAi: false,
    });
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(true);
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/demo/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'PROVIDER' }),
    });
    expect(sessionResponse.status).toBe(201);
    const session = await sessionResponse.json() as { token: string };
    const intake = await fetch(`http://127.0.0.1:${port}/api/demo/intake`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ fixtureId: 'ready-review' }),
    });
    expect(intake.status).toBe(200);
    expect(await intake.json()).toMatchObject({ caseId: 'case_den_001', state: 'packet_ready' });
    expect(run.output().includes(TEST_KEY)).toBe(false);
    run.child.kill('SIGTERM');
    expect((await run.exited).code).toBe(0);
  });

  const builtClient = process.env.MEDAUTH_RUNTIME_ACCEPTANCE_DIST;
  it.skipIf(!builtClient)('serves the built client and preserves isolated workflow state across a real process restart', async () => {
    const clientDir = path.resolve(builtClient!);
    const index = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
    const asset = index.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
    if (!asset) throw new Error('Build the demo client before running release-runtime acceptance.');
    const assetHash = createHash('sha256').update(fs.readFileSync(path.join(clientDir, asset.slice(1)))).digest('hex');
    const dataDir = makeDirectory();
    const configuration = { MEDAUTH_DEMO_DATA_DIR: dataDir, MEDAUTH_DEMO_ENCRYPTION_KEY: TEST_KEY, MEDAUTH_CLIENT_DIST: clientDir };
    const firstPort = await freePort();
    const first = launch({ ...configuration, PORT: String(firstPort) });
    await waitReady(first);
    let base = `http://127.0.0.1:${firstPort}`;
    const api = async (route: string, token?: string, body?: unknown) => {
      const response = await fetch(base + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const verifyAssets = async () => {
      const page = await fetch(base + '/');
      expect(page.status).toBe(200);
      expect(await page.text()).toContain(asset);
      const response = await fetch(base + asset);
      expect(response.status).toBe(200);
      expect(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')).toBe(assetHash);
    };
    await verifyAssets();
    const provider = await api('/api/demo/start', undefined, { role: 'PROVIDER' });
    const biller = await api('/api/demo/start', undefined, { role: 'BILLER' });
    expect(provider.status).toBe(201); expect(biller.status).toBe(201);
    const tokenA = provider.body.token as string;
    const tokenB = biller.body.token as string;
    expect(typeof tokenA).toBe('string'); expect(typeof tokenB).toBe('string');
    expect((await api('/api/demo/intake', tokenA, { fixtureId: 'ready-review' })).status).toBe(200);
    expect((await api('/api/demo/intake', tokenB, { fixtureId: 'ready-review' })).status).toBe(200);
    const caseRoute = '/api/cases/case_den_001';
    const ready = await api(caseRoute, tokenA);
    expect(ready.body.case.state).toBe('packet_ready');
    expect((await api(caseRoute + '/approve', tokenA, { packetVersion: ready.body.case.packetVersion })).status).toBe(200);
    expect((await api(caseRoute + '/handoff', tokenA, {})).status).toBe(200);
    expect((await api(caseRoute + '/submit', tokenA, {})).status).toBe(200);
    const beforeA = await api(caseRoute, tokenA);
    const beforeB = await api(caseRoute, tokenB);
    const beforeReceipt = await api(caseRoute + '/receipt', tokenA);
    const beforeHandoff = await api(caseRoute + '/handoff', tokenA);
    expect(beforeA.body.case.state).toBe('submitted');
    expect(beforeB.body.case.state).toBe('packet_ready');
    expect(beforeA.body.latestJob.status).toBe('done');
    expect(beforeReceipt.status).toBe(200); expect(beforeHandoff.status).toBe(200);
    first.child.kill('SIGTERM');
    expect((await first.exited).code).toBe(0);

    const secondPort = await freePort();
    const second = launch({ ...configuration, PORT: String(secondPort) });
    await waitReady(second);
    expect(second.child.pid === first.child.pid).toBe(false);
    base = `http://127.0.0.1:${secondPort}`;
    const health = await api('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ assets: 'ready', registry: 'ready', ehrAdapter: 'synthetic', aiProvider: 'local-stub', allowCloudAi: false });
    await verifyAssets();
    expect((await api(caseRoute, tokenA)).body).toEqual(beforeA.body);
    expect((await api(caseRoute, tokenB)).body).toEqual(beforeB.body);
    expect((await api(caseRoute + '/receipt', tokenA)).body).toEqual(beforeReceipt.body);
    expect((await api(caseRoute + '/handoff', tokenA)).body).toEqual(beforeHandoff.body);
    expect((await api(caseRoute + '/approve', tokenB, { packetVersion: beforeB.body.case.packetVersion })).status).toBe(403);
    expect((await api(caseRoute, tokenB)).body.case.state).toBe('packet_ready');
    for (const token of [tokenA, tokenB]) expect((await api('/api/auth/logout', token, {})).status).toBe(200);
    expect((await api('/api/cases', tokenA)).status).toBe(401);
    expect((await api('/api/cases', tokenB)).status).toBe(401);
    // Boolean assertions cannot print a bearer token as the expected needle
    // if a future logging regression exposes it in either process output.
    for (const output of [first.output(), second.output()]) {
      expect(output.includes(TEST_KEY)).toBe(false);
      for (const token of [tokenA, tokenB]) expect(output.includes(token)).toBe(false);
    }
    second.child.kill('SIGTERM');
    expect((await second.exited).code).toBe(0);
  }, 10_000);
});
