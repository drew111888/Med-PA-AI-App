import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDemoApp } from './index.ts';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
const KEY = 'synthetic-key-readiness-test-only';
const roots: string[] = [];
const stops: Array<() => Promise<void>> = [];
const temporary = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'medauth-demo-key-readiness-'));
  roots.push(root);
  return root;
};
const digest = (file: string): string => fs.existsSync(file)
  ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'absent';

async function launch(dataDir: string, extra: Partial<Parameters<typeof createDemoApp>[0]> = {}) {
  const runtime = createDemoApp({ dataDir, encryptionKey: KEY, ...extra });
  const server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No disposable HTTP listener.');
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await runtime.close();
  };
  stops.push(stop);
  return { base: `http://127.0.0.1:${address.port}`, stop };
}

async function api(base: string, route: string, token?: string, body?: unknown) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any, headers: response.headers };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const stop of stops.splice(0).reverse()) await stop();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('demo key binding and registry readiness', () => {
  it('rejects missing or whitespace keys before creating store files', () => {
    const root = temporary();
    for (const key of [undefined, '', ' \n\t ']) {
      const dataDir = path.join(root, crypto.randomUUID());
      expect(() => createDemoApp({ dataDir, encryptionKey: key as unknown as string })).toThrow(/encryption key/i);
      expect(fs.existsSync(dataDir)).toBe(false);
    }
  });

  it('refuses a wrong key before HTTP startup, then reopens the original encrypted case without loss', async () => {
    const dataDir = temporary();
    const first = await launch(dataDir);
    const started = await api(first.base, '/api/demo/start', undefined, { role: 'PROVIDER' });
    expect(started.status).toBe(201);
    const token = started.body.token as string;
    expect((await api(first.base, '/api/demo/intake/ready-review', token, {})).status).toBe(200);
    const before = await api(first.base, '/api/cases/case_den_001', token);
    expect(before.status).toBe(200);
    expect(before.body.case.packet.draftLetter.length).toBeGreaterThan(40);
    await first.stop();

    const registryBefore = digest(path.join(dataDir, 'registry.sqlite'));
    expect(() => createDemoApp({ dataDir, encryptionKey: 'different-synthetic-test-key' })).toThrow(/key verification failed/i);
    expect(digest(path.join(dataDir, 'registry.sqlite'))).toBe(registryBefore);

    const reopened = await launch(dataDir);
    const health = await api(reopened.base, '/api/health');
    expect(health.status).toBe(200);
    expect(health.body.registry).toBe('ready');
    const after = await api(reopened.base, '/api/cases/case_den_001', token);
    expect(after.status).toBe(200);
    expect(after.body.case).toEqual(before.body.case);
  });

  it('does not bind a legacy nonempty registry to an unverified key or modify its bytes', () => {
    const dataDir = temporary();
    const file = path.join(dataDir, 'registry.sqlite');
    const legacy = new DatabaseSync(file);
    legacy.exec('CREATE TABLE demo_sandboxes(id TEXT PRIMARY KEY); INSERT INTO demo_sandboxes VALUES (\'synthetic-legacy-row\');');
    legacy.close();
    const before = digest(file);
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY })).toThrow(/no key verifier/i);
    expect(digest(file)).toBe(before);
    expect(fs.existsSync(path.join(dataDir, 'sandboxes'))).toBe(false);
    expect(fs.readdirSync(dataDir)).toEqual(['registry.sqlite']);
  });

  it('refuses orphaned generation state even if its registry is absent', () => {
    const dataDir = temporary();
    const generation = path.join(dataDir, 'sandboxes', crypto.randomUUID(), crypto.randomUUID());
    fs.mkdirSync(generation, { recursive: true });
    const file = path.join(generation, 'state.sqlite');
    fs.writeFileSync(file, 'synthetic legacy state; not a real patient database');
    const before = digest(file);
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY })).toThrow(/no key verifier/i);
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(false);
    expect(digest(file)).toBe(before);
  });

  it('initializes an existing empty SQLite store', async () => {
    const dataDir = temporary();
    new DatabaseSync(path.join(dataDir, 'registry.sqlite')).close();
    const host = await launch(dataDir);
    expect((await api(host.base, '/api/health')).status).toBe(200);
    expect((await api(host.base, '/api/demo/start', undefined, { role: 'BILLER' })).status).toBe(201);
  });

  it('rejects a plaintext sentinel instead of accepting decryptField legacy passthrough', async () => {
    const dataDir = temporary();
    const first = await launch(dataDir);
    await first.stop();
    const file = path.join(dataDir, 'registry.sqlite');
    const changed = new DatabaseSync(file);
    changed.prepare('UPDATE demo_meta SET value=? WHERE key=?').run('medauth-synthetic-demo:registry-key:v1', 'encryption_key_v1');
    changed.close();
    const before = digest(file);
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY })).toThrow(/key verification failed/i);
    expect(digest(file)).toBe(before);
  });

  it('fails startup on a write/fsync probe error and cleans only its own probe', () => {
    const dataDir = temporary();
    fs.writeFileSync(path.join(dataDir, 'keep.txt'), 'synthetic operator marker');
    const spy = vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => { throw new Error('synthetic write failure'); });
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY })).toThrow(/not writable/i);
    spy.mockRestore();
    expect(fs.readdirSync(dataDir)).toEqual(['keep.txt']);
    expect(fs.readFileSync(path.join(dataDir, 'keep.txt'), 'utf8')).toBe('synthetic operator marker');
  });

  it('health checks query readiness without changing registry or WAL bytes', async () => {
    const dataDir = temporary();
    const host = await launch(dataDir);
    const before = ['registry.sqlite', 'registry.sqlite-wal'].map(name => digest(path.join(dataDir, name)));
    for (let i = 0; i < 3; i++) {
      const health = await api(host.base, '/api/health');
      expect(health.status).toBe(200);
      expect(health.headers.get('cache-control')).toMatch(/no-store/);
      expect(health.body.registry).toBe('ready');
    }
    expect(['registry.sqlite', 'registry.sqlite-wal'].map(name => digest(path.join(dataDir, name)))).toEqual(before);
  });

  it('reports registry unready with a sanitized 503 when metadata becomes unavailable', async () => {
    const dataDir = temporary();
    const host = await launch(dataDir);
    const change = new DatabaseSync(path.join(dataDir, 'registry.sqlite'));
    const original = (change.prepare('SELECT value FROM demo_meta WHERE key=?').get('encryption_key_v1') as { value: string }).value;
    try {
      change.prepare('UPDATE demo_meta SET value=? WHERE key=?').run('synthetic-corruption', 'encryption_key_v1');
      const health = await api(host.base, '/api/health');
      expect(health.status).toBe(503);
      expect(health.body.status).toBe('degraded');
      expect(health.body.registry).toBe('unavailable');
      expect(JSON.stringify(health.body)).not.toContain(dataDir);
      expect(JSON.stringify(health.body)).not.toContain(KEY);
    } finally {
      change.prepare('UPDATE demo_meta SET value=? WHERE key=?').run(original, 'encryption_key_v1');
      change.close();
    }
    expect((await api(host.base, '/api/health')).status).toBe(200);
  });
});

describe('demo public asset boundary', () => {
  const publicFiles = (root: string): string => {
    const client = path.join(root, 'public');
    fs.mkdirSync(client, { recursive: true });
    fs.writeFileSync(path.join(client, 'index.html'), '<!doctype html><title>Synthetic demo client</title><h1>Synthetic client</h1>');
    return client;
  };

  it('requires a supplied client directory and readable index before initialization', () => {
    const root = temporary();
    const dataDir = path.join(root, 'private');
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY, clientDistPath: path.join(root, 'absent') })).toThrow(/index\.html/i);
    const empty = path.join(root, 'empty-public');
    fs.mkdirSync(empty);
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY, clientDistPath: empty })).toThrow(/index\.html/i);
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(false);
  });

  it('rejects equal, ancestor, and descendant asset/data roots', () => {
    const root = temporary();
    const dataDir = path.join(root, 'private');
    fs.mkdirSync(dataDir);
    const child = path.join(dataDir, 'public');
    fs.mkdirSync(child);
    for (const client of [dataDir, root, child]) {
      expect(() => createDemoApp({ dataDir, encryptionKey: KEY, clientDistPath: client })).toThrow(/separate directories/i);
    }
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(false);
  });

  it('rejects a symlink alias to a private data root', () => {
    const root = temporary();
    const dataDir = path.join(root, 'private');
    fs.mkdirSync(dataDir);
    const alias = path.join(root, 'public-alias');
    fs.symlinkSync(dataDir, alias, 'dir');
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY, clientDistPath: alias })).toThrow(/separate directories/i);
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(false);
  });

  it('rejects the real project source root and its ancestor as public assets', () => {
    const dataDir = temporary();
    const sourceRoot = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
    for (const client of [sourceRoot, path.dirname(sourceRoot)]) {
      expect(() => createDemoApp({ dataDir, encryptionKey: KEY, clientDistPath: client })).toThrow(/project source directory/i);
    }
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(false);
  });

  it('rejects nested public symlinks into private synthetic files without touching their bytes', () => {
    const root = temporary();
    const client = publicFiles(root);
    const dataDir = path.join(root, 'private');
    fs.mkdirSync(dataDir);
    const privateFixture = path.join(dataDir, 'private-fixture.sqlite');
    fs.writeFileSync(privateFixture, 'synthetic private fixture only');
    fs.mkdirSync(path.join(client, 'assets'));
    fs.symlinkSync(privateFixture, path.join(client, 'assets', 'private.sqlite'), 'file');
    const before = digest(privateFixture);
    expect(() => createDemoApp({ dataDir, encryptionKey: KEY, clientDistPath: client })).toThrow(/symlinks and special files/i);
    expect(digest(privateFixture)).toBe(before);
    expect(fs.existsSync(path.join(dataDir, 'registry.sqlite'))).toBe(false);
  });

  it('serves a safe sibling build and degrades health when its index disappears', async () => {
    const root = temporary();
    const client = publicFiles(root);
    const host = await launch(path.join(root, 'private'), { clientDistPath: client });
    const page = await fetch(host.base + '/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Synthetic client');
    const ready = await api(host.base, '/api/health');
    expect(ready.status).toBe(200);
    expect(ready.body.assets).toBe('ready');
    fs.unlinkSync(path.join(client, 'index.html'));
    const missing = await api(host.base, '/api/health');
    expect(missing.status).toBe(503);
    expect(missing.body.registry).toBe('ready');
    expect(missing.body.assets).toBe('unavailable');
    expect(JSON.stringify(missing.body)).not.toContain(root);
  });
});
