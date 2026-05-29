import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Route map (works in BOTH dev and production via Vite's dev server):
 *
 *   /                → landing.html  (the public landing page)
 *   /app             → index.html    (the React SPA)
 *   /app/*           → index.html    (SPA client-side routes)
 *   /landing         → landing.html  (alias)
 *   /index.tsx etc   → Vite handles  (source transforms)
 *   /api/*           → proxied to backend
 *
 * The trick: we intercept / and /app in middleware BEFORE Vite's own
 * handler, so Vite never gets a chance to resolve /app → App.tsx.
 * We read the correct HTML file from disk and send it directly.
 */
function routerPlugin(): Plugin {
  return {
    name: 'arbiter-router',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '/';

        // Landing page routes
        if (url === '/' || url === '/landing' || url === '/landing.html') {
          const filePath = path.resolve(__dirname, 'landing.html');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(filePath, 'utf-8'));
            return;
          }
        }

        // React SPA routes — serve index.html for /app and any /app/* path
        // that isn't a static asset (no extension in path)
        if (
          url === '/app' ||
          url === '/app/' ||
          (url.startsWith('/app/') && !path.extname(url))
        ) {
          // Let Vite transform index.html normally (handles HMR injection)
          req.url = '/index.html';
        }

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
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), routerPlugin()],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
