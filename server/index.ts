/**
 * Local API server entry point.
 *
 * Boots the embedded DB, runs migrations, builds services, performs UNCONDITIONAL
 * boot-time job recovery (runStartupRecovery — requeues crash-interrupted jobs
 * and drains them exactly once, regardless of the scheduler setting), then
 * explicitly starts the periodic background scheduler only when enabled, and
 * starts the HTTP server bound to a local interface.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { loadConfig } from './config.ts';
import { openDb, runMigrations } from './db/index.ts';
import { createApp } from './app.ts';
import { runStartupRecovery } from './jobs/startupRecovery.ts';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const db = openDb(config);
  const applied = runMigrations(db);
  if (applied.length > 0) {
    console.log(`[db] applied migrations: ${applied.join(', ')}`);
  }

  const { app, ctx } = createApp(config, db);

  // Unconditional boot recovery: requeue any jobs interrupted by a prior crash
  // and drain them once, independent of whether the periodic scheduler is on.
  const rec = await runStartupRecovery(ctx.services);
  console.log(`[medauth] startup recovery: recovered=${rec.recovered} drained=${rec.drained}`);

  // Explicitly start the periodic worker/scheduler (polling only; recovery
  // already ran above).
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
