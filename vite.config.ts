import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendPort = env.BACKEND_PORT || '5050';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // In dev, /api/* → http://localhost:5050/api/*
        // This avoids CORS issues and removes any need for hardcoded backend URLs.
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    // No more Gemini API key needed
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
