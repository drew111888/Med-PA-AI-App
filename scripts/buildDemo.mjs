import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Build only the isolated test-account UI. No runtime secret is included in
// Vite defines; the API uses the same origin as the page by default.
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const result = spawnSync(process.execPath, [vite, 'build'], {
  stdio: 'inherit',
  env: { ...process.env, MEDAUTH_DEMO_MODE: 'true' },
});
process.exit(result.status ?? 1);
