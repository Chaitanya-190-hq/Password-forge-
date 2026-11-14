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
    // The only optional external request in the whole app: the breach-check API.
    "connect-src 'self' https://api.pwnedpasswords.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
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
  plugins: [react(), contentSecurityPolicy()],
  server: { allowedHosts },
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
