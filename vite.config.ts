import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE (local-first architecture):
// The AI provider key is NEVER injected into the client bundle. All AI calls go
// through the local backend's AIProviderPort, which enforces de-identification
// before any outbound request. The client only knows the local API base URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // A production/demo browser must call its own HTTPS origin. Only the local
  // development proxy needs a loopback target; never bake it into a release.
  const apiBase = env.MEDAUTH_API_BASE || '';
  const demoMode = env.MEDAUTH_DEMO_MODE === 'true';
  return {
    server: {
      port: 3000,
      host: '127.0.0.1',
      proxy: {
        // Forward API calls to the local backend during UI development.
        '/api': {
          target: apiBase || 'http://127.0.0.1:4000',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.MEDAUTH_API_BASE': JSON.stringify(apiBase),
      'process.env.MEDAUTH_DEMO_MODE': JSON.stringify(demoMode ? 'true' : 'false'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
