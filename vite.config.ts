import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE (local-first architecture):
// The AI provider key is NEVER injected into the client bundle. All AI calls go
// through the local backend's AIProviderPort, which enforces de-identification
// before any outbound request. The client only knows the local API base URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiBase = env.MEDAUTH_API_BASE || 'http://127.0.0.1:4000';
  return {
    server: {
      port: 3000,
      host: '127.0.0.1',
      proxy: {
        // Forward API calls to the local backend during UI development.
        '/api': {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.MEDAUTH_API_BASE': JSON.stringify(apiBase),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
