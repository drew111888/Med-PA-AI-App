/**
 * Express application factory.
 *
 * Kept separate from listen() so tests can exercise the app in-process. In
 * production the same app serves the built React UI from clientDistPath so the
 * whole system is reachable at a single local URL.
 *
 * All data routes are authenticated and permission-checked. The former
 * unauthenticated /api/dev/* routes (which exposed denials and chart PHI) have
 * been removed.
 */

import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config.ts';
import { openDb, checkDbHealth, type Db } from './db/index.ts';
import { resolvePorts, type Ports } from './adapters/registry.ts';
import { buildServices, type Services } from './services.ts';
import { createCaseRouter } from './routes/caseRoutes.ts';
import { createAuthRouter } from './auth/authRoutes.ts';
import { seedUsersIfEmpty } from './auth/bootstrap.ts';
import type { AiRegistryOptions } from './ai/registry.ts';

export interface AppContext {
  config: AppConfig;
  db: Db;
  ports: Ports;
  services: Services;
}

export const createApp = (
  config: AppConfig,
  db?: Db,
  aiOptions: AiRegistryOptions = {},
): { app: Express; ctx: AppContext } => {
  const database = db ?? openDb(config);
  const ports = resolvePorts(config);
  const services = buildServices(config, database, ports, aiOptions);
  const ctx: AppContext = { config, db: database, ports, services };

  // Seed synthetic users for local/synthetic development if none exist.
  seedUsersIfEmpty(services.users);

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health endpoint (unauthenticated: no PHI, connectivity only).
  app.get('/api/health', (_req, res) => {
    const dbOk = checkDbHealth(ctx.db);
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'unavailable',
      ehrAdapter: ctx.config.ehrAdapter,
      aiProvider: ctx.config.aiProvider,
      allowCloudAi: ctx.config.allowCloudAi,
      time: new Date().toISOString(),
    });
  });

  // Authentication routes (login/logout/me).
  app.use('/api', createAuthRouter(ctx.services.users, ctx.services.audit));

  // Case / packet / job / approval / handoff / submission API (all authenticated).
  app.use('/api', createCaseRouter(ctx.services, ctx.ports.ehr, ctx.services.users));

  // JSON error handler for API routes.
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
    res.status(500).send('Internal error');
  });

  // Serve the built client in production if present.
  const indexHtml = path.join(ctx.config.clientDistPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(ctx.config.clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(indexHtml);
    });
  }

  return { app, ctx };
};
