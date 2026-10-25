/**
 * Express application factory.
 *
 * Kept separate from the listen() call so tests can exercise the app in-process.
 * In production the same app serves the built React UI from clientDistPath so
 * the whole system is reachable at a single local URL.
 */

import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config.ts';
import { openDb, checkDbHealth, type Db } from './db/index.ts';
import { resolvePorts, type Ports } from './adapters/registry.ts';
import { buildServices, type Services } from './services.ts';
import { createCaseRouter } from './routes/caseRoutes.ts';
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

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health endpoint: reports process + DB connectivity.
  app.get('/api/health', (_req, res) => {
    const dbOk = checkDbHealth(ctx.db);
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'unavailable',
      ehrAdapter: ctx.config.ehrAdapter,
      aiProvider: ctx.config.aiProvider,
      time: new Date().toISOString(),
    });
  });

  // Dev route: list discoverable denials through EHRPort (Task 2 demo).
  app.get('/api/dev/denials', async (_req, res, next) => {
    try {
      const denials = await ctx.ports.ehr.discoverDenials();
      res.json({ adapter: ctx.ports.ehr.name, count: denials.length, denials });
    } catch (err) {
      next(err);
    }
  });

  // Dev route: fetch a patient's chart through EHRPort (Task 2 demo).
  app.get('/api/dev/patients/:id/chart', async (req, res, next) => {
    try {
      const patient = await ctx.ports.ehr.getPatient(req.params.id);
      if (!patient) return res.status(404).json({ error: 'patient not found' });
      const documents = await ctx.ports.ehr.getChartDocuments(req.params.id);
      res.json({ patient, documentCount: documents.length, documents });
    } catch (err) {
      next(err);
    }
  });

  // Case / packet / job / approval API.
  app.use('/api', createCaseRouter(ctx.services, ctx.ports.ehr));

  // JSON error handler for API routes.
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
    res.status(500).send('Internal error');
  });

  // Serve the built client in production if present. In dev, Vite serves the UI
  // on its own port; the API is consumed cross-origin from there.
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
