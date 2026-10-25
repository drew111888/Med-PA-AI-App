/**
 * Local API server entry point.
 *
 * Boots the embedded DB, runs migrations, and starts the HTTP server bound to a
 * local interface. This is the single local process a practice runs; staff
 * reach the UI and API via a local URL.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { loadConfig } from './config.ts';
import { openDb, runMigrations } from './db/index.ts';
import { createApp } from './app.ts';

const main = (): void => {
  const config = loadConfig();
  const db = openDb(config);
  const applied = runMigrations(db);
  if (applied.length > 0) {
    console.log(`[db] applied migrations: ${applied.join(', ')}`);
  }

  const { app } = createApp(config, db);

  app.listen(config.port, config.host, () => {
    console.log(
      `[medauth] local server listening at http://${config.host}:${config.port}`,
    );
    console.log(
      `[medauth] ehr=${config.ehrAdapter} payerPolicy=${config.payerPolicyAdapter} ai=${config.aiProvider} cloudAi=${config.allowCloudAi}`,
    );
  });
};

main();
