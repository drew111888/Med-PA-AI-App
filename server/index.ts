/**
 * Local API server entry point.
 *
 * Boots the embedded DB, runs migrations, builds services, explicitly starts the
 * background scheduler (restart recovery + periodic polling), and starts the
 * HTTP server bound to a local interface.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { loadConfig } from './config.ts';
import { openDb, runMigrations } from './db/index.ts';
import { createApp } from './app.ts';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const db = openDb(config);
  const applied = runMigrations(db);
  if (applied.length > 0) {
    console.log(`[db] applied migrations: ${applied.join(', ')}`);
  }

  const { app, ctx } = createApp(config, db);

  // Explicitly start the worker/scheduler (recovers interrupted jobs first).
  if (config.enableScheduler) {
    await ctx.services.scheduler.start();
    console.log(
      `[medauth] scheduler started (pollIntervalMs=${config.pollIntervalMs})`,
    );
  } else {
    console.log('[medauth] scheduler disabled');
  }

  app.listen(config.port, config.host, () => {
    console.log(`[medauth] local server listening at http://${config.host}:${config.port}`);
    console.log(
      `[medauth] ehr=${config.ehrAdapter} payerPolicy=${config.payerPolicyAdapter} ai=${config.aiProvider} cloudAi=${config.allowCloudAi}`,
    );
  });
};

void main();
