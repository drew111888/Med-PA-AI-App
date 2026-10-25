import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp, type AppContext } from '../app.ts';
import { openDb } from '../db/index.ts';
import type { AppConfig } from '../config.ts';
import { UserRepository, type AuthUser } from '../auth/userRepository.ts';
import { hashToken, newToken } from '../auth/password.ts';
import { DemoRegistry, type SandboxRecord, type DemoTokenRecord } from './registry.ts';
import { DEMO_FIXTURES, DEMO_DENIAL_IDS, DEMO_UNKNOWN_DENIAL, fixtureRoute } from './fixtures.ts';
import { DEFAULT_DEMO_LIMITS, type DemoOptions, type DemoLimits, type DemoRole, type DemoRuntime, type DemoSessionInfo, type DemoSessionResponse } from './types.ts';

export type { DemoOptions, DemoLimits, DemoRole, DemoRuntime, DemoSessionInfo, DemoSessionResponse } from './types.ts';
export { DEFAULT_DEMO_LIMITS } from './types.ts';

class DemoError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) { super(message); }
}
interface LiveSandbox {
  record: SandboxRecord;
  app: ReturnType<typeof createApp>['app'];
  ctx: AppContext;
  ready: Promise<void>;
  initializing: boolean;
  inFlight: number;
  pendingDelete: boolean;
}
interface Authorized {
  record: SandboxRecord;
  token: DemoTokenRecord;
  hash: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CASE_ID = '[A-Za-z0-9_-]{1,100}';
const caseRead = new RegExp(`^/api/cases/(${CASE_ID})(?:/(handoff|receipt))?$`);
const caseWrite = new RegExp(`^/api/cases/(${CASE_ID})/(approve|retry|handoff|submit)$`);
const standardReads = new Set(['/api/auth/me', '/api/cases', '/api/summary', '/api/jobs']);
const standardWrites = new Set(['/api/auth/logout', '/api/run/poll', '/api/run/denial/den_001', '/api/run/denial/den_002', '/api/run/denial/den_003']);
const demoPaths = new Set(['/api/demo/start', '/api/demo/role', '/api/demo/reset', '/api/demo/session', '/api/demo/intake']);
const containsPath = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
};
const pathsOverlap = (a: string, b: string): boolean => containsPath(a, b) || containsPath(b, a);
const inspectPublicTree = (root: string): void => {
  let entries = 0;
  const visit = (directory: string, depth: number): void => {
    if (depth > 16) throw new Error('Demo client asset tree exceeds the supported depth.');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 10_000) throw new Error('Demo client asset tree exceeds the supported entry count.');
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw new Error('Demo public assets must contain only regular files and directories; symlinks and special files are forbidden.');
      }
      const target = path.join(directory, entry.name);
      fs.accessSync(target, fs.constants.R_OK | (entry.isDirectory() ? fs.constants.X_OK : 0));
      if (entry.isDirectory()) visit(target, depth + 1);
    }
  };
  // Read metadata inside the explicitly supplied asset directory only. Never
  // follow a descendant symlink into a private store or another directory.
  visit(root, 0);
};

/**
 * A deliberately narrow gateway around the unchanged core application.
 * Each tester has a fresh on-disk core DB; registry/token lookup chooses that
 * context before core requireAuth, permissions, version checks, and handlers run.
 * It never accepts a DB path, context selector, ADMIN role, or clinical text.
 */
export const createDemoApp = (options: DemoOptions): DemoRuntime => {
  if (!options.dataDir || !path.isAbsolute(options.dataDir)) throw new Error('Demo dataDir must be an absolute dedicated directory.');
  if (!options.encryptionKey?.trim()) throw new Error('A stable demo encryption key must be supplied.');
  fs.mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(options.dataDir).isSymbolicLink()) throw new Error('Demo dataDir must not be a symlink.');
  const dataDir = fs.realpathSync(options.dataDir);
  if (dataDir === path.parse(dataDir).root) throw new Error('Demo dataDir must not be a filesystem root.');
  let clientDir: string | undefined;
  if (options.clientDistPath !== undefined) {
    try {
      clientDir = fs.realpathSync(path.resolve(options.clientDistPath));
      if (!fs.statSync(clientDir).isDirectory()) throw new Error();
      fs.accessSync(clientDir, fs.constants.R_OK | fs.constants.X_OK);
    } catch { throw new Error('Demo client assets must be an existing readable directory with index.html.'); }
    const sourceRoot = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
    if (containsPath(clientDir, sourceRoot)) throw new Error('Demo client assets must not expose the project source directory.');
    if (pathsOverlap(clientDir, dataDir)) {
      throw new Error('Demo public assets and private data must be separate directories.');
    }
    let indexReal: string;
    try {
      const index = path.join(clientDir, 'index.html');
      indexReal = fs.realpathSync(index);
      if (!fs.statSync(indexReal).isFile()) throw new Error();
      fs.accessSync(indexReal, fs.constants.R_OK);
    } catch { throw new Error('Demo client assets must be an existing readable directory with index.html.'); }
    if (pathsOverlap(indexReal, dataDir)) throw new Error('Demo public assets and private data must be separate directories.');
    inspectPublicTree(clientDir);
  }
  const clientReady = (): boolean => {
    if (!clientDir) return true; // Intentional API-only factory use in tests.
    try {
      if (fs.realpathSync(clientDir) !== clientDir) return false;
      const index = path.join(clientDir, 'index.html');
      if (!fs.statSync(index).isFile() || pathsOverlap(fs.realpathSync(index), dataDir)) return false;
      fs.accessSync(clientDir, fs.constants.R_OK | fs.constants.X_OK);
      fs.accessSync(index, fs.constants.R_OK);
      return true;
    } catch { return false; }
  };
  const sandboxRoot = path.join(dataDir, 'sandboxes');
  const now = options.now ?? Date.now;
  const limits: DemoLimits = { ...DEFAULT_DEMO_LIMITS, ...options.limits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid demo limit: ${name}`);
  }
  const registry = new DemoRegistry(dataDir, options.encryptionKey);
  const contexts = new Map<string, LiveSandbox>();
  let globalMutation = false;
  let closing = false;
  let closed = false;

  const key = (r: SandboxRecord) => `${r.id}:${r.generation}`;
  const generationDir = (r: SandboxRecord): string => {
    if (!UUID.test(r.id) || !UUID.test(r.generation)) throw new Error('Invalid internal demo generation identity.');
    const dir = path.join(sandboxRoot, r.id, r.generation);
    if (!dir.startsWith(sandboxRoot + path.sep)) throw new Error('Invalid internal demo generation path.');
    return dir;
  };

  const removeGeneration = (r: SandboxRecord): void => {
    const dir = generationDir(r);
    if (!fs.existsSync(dir)) return;
    if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== dir) throw new Error('Refusing to remove a non-owned demo generation.');
    fs.rmSync(dir, { recursive: true, force: true });
    const parent = path.dirname(dir);
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
  };

  const dispose = (live: LiveSandbox): void => {
    if (contexts.get(key(live.record)) !== live) return;
    if (live.initializing || live.inFlight > 0) { live.pendingDelete = true; return; }
    live.ctx.services.scheduler.stop();
    live.ctx.db.close();
    contexts.delete(key(live.record));
    if (live.pendingDelete) {
      removeGeneration(live.record);
      registry.forget(live.record.id, live.record.generation);
    }
  };

  const invalidate = (r: SandboxRecord): void => {
    registry.invalidate(r.id); // Revoke first, before waiting for any old request.
    const live = contexts.get(key(r));
    if (live) { live.pendingDelete = true; dispose(live); }
    else {
      removeGeneration(r);
      registry.forget(r.id, r.generation);
    }
  };

  const expired = (r: SandboxRecord) => !r.active || now() >= r.expiresAt || now() >= r.lastSeen + limits.idleMs;
  const sweep = async (): Promise<void> => {
    if (closed) return;
    registry.cleanRates(now());
    for (const r of registry.all()) if (expired(r)) invalidate(r);
  };

  const busy = () => new DemoError(409, 'demo_busy', 'A demo operation is already running. Try again shortly.', 1);
  const acquire = (): (() => void) => {
    if (closing || closed) throw new DemoError(503, 'demo_unavailable', 'The demo is stopping.');
    if (globalMutation) throw busy();
    globalMutation = true;
    let released = false;
    return () => { if (!released) { released = true; globalMutation = false; } };
  };

  const coreConfig = (record: SandboxRecord): AppConfig => ({
    port: 0,
    host: '127.0.0.1',
    dbPath: path.join(generationDir(record), 'state.sqlite'),
    dbEncryptionKey: options.encryptionKey,
    ehrAdapter: 'synthetic',
    payerPolicyAdapter: 'synthetic',
    aiProvider: 'local',
    allowCloudAi: false,
    // The gateway, never the core, owns the public asset directory.
    clientDistPath: path.join(dataDir, '.no-core-client-assets'),
    pollIntervalMs: 0,
    enableScheduler: false,
    isTest: false,
  });

  const ensureContext = async (record: SandboxRecord, alreadyLocked = false): Promise<LiveSandbox> => {
    const existing = contexts.get(key(record));
    if (existing) { await existing.ready; return existing; }
    const release = alreadyLocked ? () => {} : acquire();
    let live: LiveSandbox | undefined;
    try {
      const dir = generationDir(record);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (fs.realpathSync(dir) !== dir) throw new Error('Invalid internal demo generation directory.');
      const config = coreConfig(record);
      // Always fresh; no core singleton is shared between testers.
      const db = openDb(config, { fresh: true });
      try {
        const users = new UserRepository(db);
        if (users.countUsers() === 0) {
          db.transaction(() => {
            users.createUser('demo_provider', 'Synthetic Provider', 'PROVIDER', crypto.randomBytes(32).toString('base64url'));
            users.createUser('demo_biller', 'Synthetic Coordinator', 'BILLER', crypto.randomBytes(32).toString('base64url'));
          });
        }
        const prohibited = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role NOT IN ('PROVIDER','BILLER')").get() as any;
        if (Number(prohibited.n) !== 0) throw new Error('Demo database contains an unexpected role.');
        const core = createApp(config, db);
        live = { record, app: core.app, ctx: core.ctx, ready: Promise.resolve(), initializing: true, inFlight: 0, pendingDelete: false };
        contexts.set(key(record), live);
        const target = live;
        target.ready = (async () => {
          try {
            // Reuse core restart recovery and drain. Never start a periodic worker.
            target.ctx.services.jobs.recoverInterrupted();
            await target.ctx.services.jobs.drain();
          } finally {
            target.initializing = false;
            release();
            if (target.pendingDelete) dispose(target);
          }
        })();
        await target.ready;
        return target;
      } catch (err) {
        if (!live) db.close();
        throw err;
      }
    } catch (err) {
      release();
      if (live && !live.initializing) { live.pendingDelete = true; dispose(live); }
      throw err;
    }
  };

  const storageBytes = (dir = dataDir): number => {
    let bytes = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) bytes += storageBytes(file);
      else if (entry.isFile()) bytes += fs.statSync(file).size;
    }
    return bytes;
  };
  const checkStorage = (): void => {
    if (storageBytes() >= limits.maxStorageBytes) throw new DemoError(429, 'demo_storage_limit', 'The synthetic demo storage limit has been reached. Reset or try later.', 60);
  };
  const takeRate = (scope: string, cap: number, windowMs: number): void => {
    const retryAfter = registry.rate(scope, cap, windowMs, now());
    if (retryAfter) throw new DemoError(429, 'demo_rate_limit', 'Too many demo requests. Try again later.', retryAfter);
  };
  const plainBody = (req: Request): Record<string, unknown> => {
    if (req.body === undefined) return {};
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new DemoError(400, 'demo_invalid_body', 'A JSON object is required.');
    return req.body;
  };
  const exactBody = (req: Request, allowed: string[]): Record<string, unknown> => {
    const body = plainBody(req);
    if (Object.keys(body).some(k => !allowed.includes(k))) throw new DemoError(403, 'demo_input_forbidden', 'Only the documented synthetic demo fields are allowed.');
    return body;
  };
  const roleOf = (value: unknown): DemoRole => {
    if (value !== 'PROVIDER' && value !== 'BILLER') throw new DemoError(403, 'demo_role_forbidden', 'Choose the provider or coordinator demo role.');
    return value;
  };

  const authorize = (req: Request): Authorized => {
    const match = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i);
    const hash = match ? hashToken(match[1]) : '';
    if (req.method === 'GET') takeRate(`read:session:${hash || 'anonymous'}`, limits.readsPerMinute, 60_000);
    const token = hash ? registry.token(hash) : null;
    const record = token ? registry.get(token.sandboxId) : null;
    if (!token || !record || record.generation !== token.generation || expired(record)) {
      if (record && expired(record)) invalidate(record);
      throw new DemoError(401, 'demo_session_expired', 'This demo session is unavailable or expired. Start a new synthetic sandbox.');
    }
    registry.touch(record.id, now());
    record.lastSeen = now();
    return { record, token, hash };
  };
  const stillActive = (r: SandboxRecord): void => {
    const current = registry.get(r.id);
    if (!current || current.generation !== r.generation || expired(current)) {
      if (current && expired(current)) invalidate(current);
      throw new DemoError(401, 'demo_session_expired', 'This demo session expired. Start a new sandbox.');
    }
  };

  const sessionInfo = (record: SandboxRecord, user: AuthUser): DemoSessionInfo => ({
    user,
    expiresAt: new Date(record.expiresAt).toISOString(),
    idleExpiresAt: new Date(Math.min(record.expiresAt, record.lastSeen + limits.idleMs)).toISOString(),
    sandboxId: record.id,
    fixtures: DEMO_FIXTURES.map(f => ({ ...f })),
    limits: { maxSandboxes: limits.maxSandboxes, ttlMinutes: limits.ttlMs / 60_000, idleMinutes: limits.idleMs / 60_000, maxPolls: limits.maxPolls, maxRetriesPerCase: limits.maxRetriesPerCase },
  });

  const issue = (record: SandboxRecord, live: LiveSandbox, role: DemoRole): DemoSessionResponse => {
    const found = live.ctx.services.users.getByUsername(role === 'PROVIDER' ? 'demo_provider' : 'demo_biller');
    if (!found || found.role !== role) throw new Error('Synthetic role is not available.');
    const user: AuthUser = { id: found.id, username: found.username, name: found.name, role };
    // Invalidate every old role's token before issuing the next one.
    registry.revokeTokens(record.id);
    live.ctx.db.prepare('DELETE FROM sessions').run();
    const token = newToken();
    const coreExpiry = new Date(Math.max(Date.now(), now()) + limits.ttlMs + 60_000).toISOString();
    live.ctx.db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
      .run(hashToken(token), user.id, new Date(Date.now()).toISOString(), coreExpiry);
    registry.addToken(hashToken(token), record, user);
    return { token, ...sessionInfo(record, user) };
  };

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const raw = req.originalUrl;
    const p = raw.split('?')[0];
    if (/^\/api/i.test(p)) {
      res.setHeader('cache-control', 'no-store');
      res.setHeader('pragma', 'no-cache');
      if (closing || closed) return res.status(503).json({ error: 'The demo is stopping.', code: 'demo_unavailable' });
      const contextHeader = Object.keys(req.headers).some(k => /^x-(?:demo|sandbox)(?:-|$)/i.test(k));
      if (!p.startsWith('/api/') || raw.includes('?') || /[%\\]/.test(raw) || p.includes('//') || p.endsWith('/') || p.split('/').some(x => x === '.' || x === '..') || contextHeader) {
        return res.status(403).json({ error: 'This route or context selector is not available in the synthetic demo.', code: 'demo_route_forbidden' });
      }
      const known = (req.method === 'GET' && (p === '/api/health' || p === '/api/demo/session' || standardReads.has(p) || caseRead.test(p))) ||
        (req.method === 'POST' && ((demoPaths.has(p) && p !== '/api/demo/session') || /^\/api\/demo\/intake\/[a-z-]+$/.test(p) || standardWrites.has(p) || caseWrite.test(p)));
      if (!known) return res.status(403).json({ error: 'This API route is not available in the synthetic demo.', code: 'demo_route_forbidden' });
      if (req.method === 'POST') {
        const lengthHeader = req.get('content-length');
        const length = lengthHeader === undefined ? 0 : Number(lengthHeader);
        if (!Number.isSafeInteger(length) || length < 0 || length > limits.bodyBytes) {
          return res.status(413).json({ error: 'Demo requests exceed the documented body limit.', code: 'demo_body_limit' });
        }
        const hasBody = length > 0 || Boolean(req.get('transfer-encoding'));
        if (hasBody && !req.is('application/json')) {
          return res.status(415).json({ error: 'Nonempty demo requests must use application/json.', code: 'demo_content_type' });
        }
      }
      // Bound public/IP traffic before JSON parsing or authorization can touch
      // sandbox timestamps. Never trust visitor forwarding/context headers.
      if (p !== '/api/health') {
        try {
          takeRate('api:global', limits.requestsPerMinute * limits.maxSandboxes, 60_000);
          takeRate(`api:peer:${req.socket.remoteAddress ?? 'unknown'}`, limits.requestsPerMinute, 60_000);
        } catch (err) {
          sendError(res, err);
          return;
        }
      }
    }
    next();
  });
  app.use(express.json({ limit: limits.bodyBytes, strict: true }));

  const sendError = (res: Response, err: unknown): void => {
    if (res.headersSent || res.destroyed) return;
    if (err instanceof DemoError) {
      if (err.retryAfter) res.setHeader('retry-after', String(err.retryAfter));
      res.status(err.status).json({ error: err.message, code: err.code, ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}) });
    } else {
      // Never expose file paths, secrets, registry details, or stack traces.
      res.status(500).json({ error: 'The synthetic demo operation failed. Try a fresh sandbox.', code: 'demo_internal_error' });
    }
  };
  const asyncRoute = (fn: (req: Request, res: Response) => Promise<void> | void) =>
    (req: Request, res: Response) => { void Promise.resolve().then(() => fn(req, res)).catch(err => sendError(res, err)); };

  app.get('/api/health', (_req, res) => {
    const registryReady = registry.isReady();
    const assetsReady = clientReady();
    const ready = registryReady && assetsReady;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', registry: registryReady ? 'ready' : 'unavailable', assets: clientDir ? (assetsReady ? 'ready' : 'unavailable') : 'not-configured', mode: 'synthetic-demo', ehrAdapter: 'synthetic', aiProvider: 'local-stub', allowCloudAi: false });
  });

  app.post('/api/demo/start', asyncRoute(async (req, res) => {
    const role = roleOf(exactBody(req, ['role']).role);
    const release = acquire();
    let record: SandboxRecord | undefined;
    try {
      await sweep();
      takeRate('start:global', limits.startsPerMinute * 2, 60_000);
      takeRate(`start:ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`, limits.startsPerMinute, 60_000);
      checkStorage();
      if (registry.all().filter(r => r.active && !expired(r)).length >= limits.maxSandboxes) throw new DemoError(429, 'demo_capacity', 'All synthetic demo slots are busy. Try again after a session expires.', 60);
      record = registry.create(crypto.randomUUID(), crypto.randomUUID(), now(), limits.ttlMs);
      const live = await ensureContext(record, true);
      checkStorage();
      stillActive(record);
      res.status(201).json(issue(record, live, role));
    } catch (err) {
      if (record) invalidate(record);
      throw err;
    } finally { release(); }
  }));

  app.get('/api/demo/session', asyncRoute((req, res) => {
    const a = authorize(req);
    res.json(sessionInfo(a.record, { id: a.token.userId, username: a.token.username, name: a.token.name, role: a.token.role }));
  }));

  app.post('/api/demo/role', asyncRoute(async (req, res) => {
    const role = roleOf(exactBody(req, ['role']).role);
    const a = authorize(req);
    const release = acquire();
    try {
      const live = await ensureContext(a.record, true);
      if (live.inFlight) throw busy();
      takeRate(`mutate:${a.record.id}`, limits.mutationsPerMinute, 60_000);
      stillActive(a.record);
      res.json(issue(a.record, live, role));
    } finally { release(); }
  }));

  app.post('/api/demo/reset', asyncRoute(async (req, res) => {
    exactBody(req, []);
    const a = authorize(req);
    const release = acquire();
    try {
      const old = contexts.get(key(a.record));
      if (old && (old.inFlight || old.initializing)) throw busy();
      takeRate(`reset:${a.record.id}`, limits.resetsPerHour, 60 * 60_000);
      takeRate(`mutate:${a.record.id}`, limits.mutationsPerMinute, 60_000);
      registry.revokeTokens(a.record.id);
      if (old) { old.pendingDelete = true; dispose(old); }
      else removeGeneration(a.record);
      const record = registry.reset(a.record.id, crypto.randomUUID(), now());
      const live = await ensureContext(record, true);
      stillActive(record);
      res.json(issue(record, live, a.token.role));
    } catch (err) {
      const current = registry.get(a.record.id);
      if (current && current.generation !== a.record.generation) invalidate(current);
      throw err;
    } finally { release(); }
  }));

  /** Forward a fixed route into the core, retaining its real auth/RBAC/state behavior. */
  const forward = async (req: Request, res: Response, replacement?: { path: string; body: Record<string, unknown> }): Promise<void> => {
    const a = authorize(req);
    const target = replacement?.path ?? req.path;
    const mutating = req.method === 'POST';
    const release = mutating ? acquire() : () => {};
    let handedOff = false;
    try {
      if (mutating) {
        takeRate(`mutate:${a.record.id}`, limits.mutationsPerMinute, 60_000);
        checkStorage();
      }
      const live = await ensureContext(a.record, mutating);
      stillActive(a.record);
      const match = target.match(caseRead) ?? target.match(caseWrite);
      const caseId = match?.[1];
      const action = match?.[2];
      if (caseId) {
        const c = live.ctx.services.cases.getCase(caseId);
        if (!c || !DEMO_DENIAL_IDS.has(c.denialId)) throw new DemoError(404, 'demo_case_not_found', 'Synthetic case not found in this sandbox.');
        if (mutating && action === 'retry') {
          if (c.denialId === DEMO_UNKNOWN_DENIAL || c.denialId.startsWith('den_pdf_')) throw new DemoError(403, 'demo_fixture_retry_unavailable', 'Retry for this PDF/unknown-date fixture is unavailable until the core intake retry supports it. Reset to repeat the fixture.');
          if (registry.retries(a.record.id, a.record.generation, caseId) >= limits.maxRetriesPerCase) throw new DemoError(429, 'demo_retry_limit', 'The retry limit for this synthetic case has been reached. Reset to start again.', 60);
        }
        if (mutating && action === 'submit') {
          req.body = {
            channel: 'synthetic-demo-handoff',
            confirmationNumber: `DEMO-${a.record.id.slice(0, 8)}-${caseId}-${c.packetVersion}`,
            submittedAt: new Date(now()).toISOString(),
            note: 'Synthetic demonstration receipt only. No appeal was transmitted to a payer.',
          };
        }
      }
      if (target === '/api/run/poll' && a.record.polls >= limits.maxPolls) throw new DemoError(429, 'demo_poll_limit', 'The intake poll limit for this sandbox has been reached. Reset to poll again.', 60);
      if (replacement) { req.url = replacement.path; req.body = replacement.body; }
      live.inFlight++;
      const originalEnd = res.end;
      const originalJson = res.json;
      res.json = function (this: Response, body: unknown) {
        // The unchanged core app reports Error.message on 5xx. Do not expose
        // operator paths, storage details, or internal errors at this gateway.
        const payload = this.statusCode >= 500
          ? { error: 'The synthetic workflow could not complete. Try again or reset this sandbox.', code: 'demo_core_error' }
          : body;
        return originalJson.call(this, payload);
      } as any;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        const succeeded = res.statusCode >= 200 && res.statusCode < 300;
        if (succeeded) {
          if (target === '/api/run/poll') registry.incrementPoll(a.record.id);
          if (mutating && action === 'retry' && caseId) registry.incrementRetry(a.record.id, a.record.generation, caseId);
        }
        live.inFlight--;
        // A successful logout abandons the entire tester sandbox; otherwise
        // its now-unreachable slot would linger until idle expiry.
        if (succeeded && target === '/api/auth/logout') invalidate(a.record);
        release();
        if (live.pendingDelete) dispose(live);
      };
      // A client disconnect must not release a context while an awaited core
      // operation still owns its DB. Release only when core ends/responds or
      // its final callback is reached, never merely on socket close.
      res.end = function (this: Response, ...args: any[]) {
        try { return (originalEnd as any).apply(this, args); }
        finally { finish(); }
      } as any;
      res.once('finish', finish);
      handedOff = true;
      live.app(req, res, (err?: unknown) => {
        if (!res.writableEnded) sendError(res, err ?? new DemoError(403, 'demo_route_forbidden', 'This route is unavailable in the synthetic demo.'));
        finish();
      });
    } finally { if (!handedOff) release(); }
  };

  const intake = asyncRoute(async (req, res) => {
    let fixtureId: string;
    if (req.params.fixtureId) {
      exactBody(req, []);
      fixtureId = req.params.fixtureId;
    } else {
      const body = exactBody(req, ['fixtureId']);
      fixtureId = typeof body.fixtureId === 'string' ? body.fixtureId : '';
    }
    const fixture = fixtureRoute(fixtureId);
    if (!fixture) throw new DemoError(403, 'demo_fixture_forbidden', 'Choose a committed synthetic demo fixture.');
    await forward(req, res, fixture);
  });
  app.post('/api/demo/intake', intake);
  app.post('/api/demo/intake/:fixtureId', intake);

  // Serve only non-API assets here; API requests continue into the explicit
  // gateway below. This also prevents an SPA fallback from swallowing an API.
  if (clientDir) {
    const client = clientDir;
    const assets = express.static(client);
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      if (req.method !== 'GET') return next();
      assets(req, res, () => res.sendFile(path.join(client, 'index.html')));
    });
  }

  app.use(asyncRoute(async (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found.', code: 'not_found' });
      return;
    }
    if (req.method === 'POST') {
      const match = req.path.match(caseWrite);
      if (match?.[2] === 'approve') {
        const body = exactBody(req, ['packetVersion']);
        if (!Number.isInteger(body.packetVersion) || (body.packetVersion as number) < 1) throw new DemoError(400, 'demo_invalid_version', 'A positive integer packetVersion is required.');
      } else exactBody(req, []);
    }
    await forward(req, res);
  }));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Demo requests must be smaller than the documented body limit.', code: 'demo_body_limit' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Malformed JSON request.', code: 'demo_invalid_json' });
    sendError(res, err);
  });

  // Mark any expired on-disk generations dead without opening their core DBs.
  void sweep();
  const timer = setInterval(() => { void sweep(); }, Math.min(30_000, limits.idleMs));
  timer.unref?.();

  const close = async (): Promise<void> => {
    if (closed) return;
    closing = true;
    clearInterval(timer);
    await Promise.all([...contexts.values()].map(c => c.ready.catch(() => {})));
    const deadline = Date.now() + 5_000;
    while (globalMutation || [...contexts.values()].some(c => c.inFlight > 0)) {
      if (Date.now() > deadline) throw new Error('Demo shutdown is waiting for in-flight requests.');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    for (const live of [...contexts.values()]) {
      live.ctx.services.scheduler.stop();
      live.ctx.db.close();
    }
    contexts.clear();
    registry.close();
    closed = true;
  };

  return { app, sweep, close };
};
