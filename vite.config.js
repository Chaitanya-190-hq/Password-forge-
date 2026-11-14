import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages cannot send HTTP headers, so the production Content Security
 * Policy is injected into the built index.html as a <meta> tag. It is applied
 * only to the build: the dev server needs inline scripts for React Fast Refresh.
 */
function contentSecurityPolicy() {
  const policy = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' is required by the Argon2id WASM implementation.
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "manifest-src 'self'",
    // The only optional external request in the whole app: the breach-check API.
    "connect-src 'self' https://api.pwnedpasswords.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    // frame-ancestors is intentionally omitted: browsers ignore it in a <meta>
    // policy and log an error. Clickjacking protection needs a real HTTP header,
    // which GitHub Pages cannot send.
    "worker-src 'self' blob:",
  ].join('; ');

  return {
    name: 'password-forge-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`,
      );
    },
  };
}

/**
 * Emits a service worker with a unique cache name per build and the exact list
 * of hashed assets to precache, so the installed app works offline after the
 * first visit. A new deployment installs a new worker, then drops old caches.
 */
function serviceWorker() {
  return {
    name: 'password-forge-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const shell = [
        './',
        './index.html',
        './manifest.webmanifest',
        './icons/icon-192.png',
        './icons/icon-512.png',
        './icons/icon-maskable-512.png',
        './icons/apple-touch-icon.png',
      ];
      const built = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2?|png|svg)$/.test(file))
        .map((file) => `./${file}`);

      const precache = Array.from(new Set([...shell, ...built]));
      const template = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8');
      const source = template
        .replaceAll('__BUILD_ID__', Date.now().toString(36))
        .replaceAll('__PRECACHE__', JSON.stringify(precache, null, 2));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// Optional exact dev-server hostnames for hosted previews (comma separated).
// Never a wildcard: an explicit list keeps DNS-rebinding protection intact.
const allowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  // Relative base + HashRouter keeps the app working on any GitHub Pages path
  // (user pages, project pages, custom domains) without server rewrites.
  base: './',
  plugins: [react(), contentSecurityPolicy(), serviceWorker()],
  server: { allowedHosts },
  preview: { allowedHosts },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    testTimeout: 30000,
  },
});
