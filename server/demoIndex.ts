import path from 'node:path';
import { createDemoApp } from './demo/index.ts';

/** Hosted synthetic entry; it never calls the ordinary core server bootstrap. */
const dataDir = process.env.MEDAUTH_DEMO_DATA_DIR;
const encryptionKey = process.env.MEDAUTH_DEMO_ENCRYPTION_KEY;
if (!dataDir || !encryptionKey) throw new Error('MEDAUTH_DEMO_DATA_DIR and MEDAUTH_DEMO_ENCRYPTION_KEY are required for the hosted synthetic demo.');
const port = Number(process.env.PORT ?? process.env.MEDAUTH_PORT ?? 4000);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid hosted demo port.');
const runtime = createDemoApp({
  dataDir: path.resolve(dataDir),
  encryptionKey,
  clientDistPath: process.env.MEDAUTH_CLIENT_DIST ?? path.resolve(process.cwd(), 'dist'),
});
const server = runtime.app.listen(port, process.env.MEDAUTH_HOST ?? '127.0.0.1', () => {
  console.log('[medauth-demo] Synthetic-only gateway started; local stub, no EHR or cloud transport.');
});
let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  server.close(() => { void runtime.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }); });
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
