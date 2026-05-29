import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves landing.html at '/' and the React SPA at '/app'.
 * In production both files are built as separate entry points.
 */
function landingPagePlugin(): Plugin {
  return {
    name: 'landing-page-router',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Serve landing.html for root requests
        if (req.url === '/' || req.url === '/landing' || req.url === '/landing.html') {
          const landingPath = path.resolve(__dirname, 'landing.html');
          if (fs.existsSync(landingPath)) {
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(landingPath, 'utf-8'));
            return;
          }
        }
        // All /app/* requests fall through to Vite's SPA handler (index.html)
        next();
      });
    },
  };
}

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
    plugins: [react(), landingPagePlugin()],
    // No more Gemini API key needed
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
