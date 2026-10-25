import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
    // node:sqlite is a built-in; keep it external so Vite does not try to bundle it.
    server: {
      deps: {
        external: [/node:sqlite/],
      },
    },
  },
  ssr: {
    external: ['node:sqlite'],
  },
});
