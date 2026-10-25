/**
 * Enforce Node 24+ consistently for startup and tests.
 *
 * node:sqlite (the embedded DB) requires Node 24. This fails fast with a clear
 * message rather than surfacing an obscure runtime error later.
 */

const REQUIRED_MAJOR = 24;
const [major] = process.versions.node.split('.').map(Number);

if (major < REQUIRED_MAJOR) {
  console.error(
    `\n[medauth] Node ${REQUIRED_MAJOR}+ is required (uses the built-in node:sqlite). ` +
      `Current: ${process.version}.\n`,
  );
  process.exit(1);
}
