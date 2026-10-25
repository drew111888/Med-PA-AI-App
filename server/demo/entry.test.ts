import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
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
  const child = spawn(process.execPath, ['--require', guard, '--import', 'tsx', 'server/demoIndex.ts'], {
    cwd: root,
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', MEDAUTH_HOST: '127.0.0.1', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = once(child, 'close').then(([code]) => ({ code, output }));
  return { child, exited, output: () => output };
};

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
      expect(result.output).not.toContain('gateway started');
    }
  });

  it('rejects an invalid platform port without exposing its supplied key or opening a store', async () => {
    const base = makeDirectory();
    const dataDir = path.join(base, 'store');
    const run = launch({ MEDAUTH_DEMO_DATA_DIR: dataDir, MEDAUTH_DEMO_ENCRYPTION_KEY: TEST_KEY, PORT: '65536' });
    const result = await run.exited;
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('Invalid hosted demo port');
    expect(result.output).not.toContain(TEST_KEY);
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
    await new Promise<void>((resolve, reject) => {
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
    expect(run.output()).not.toContain(TEST_KEY);
    run.child.kill('SIGTERM');
    expect((await run.exited).code).toBe(0);
  });
});
