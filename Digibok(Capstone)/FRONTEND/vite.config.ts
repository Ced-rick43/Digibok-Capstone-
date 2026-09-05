import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Vite's CLI resolves `root` against cwd, not against this config file's own location —
    // declare it explicitly so `vite build --config FRONTEND/vite.config.ts` (run from the
    // repo root) still finds FRONTEND/index.html regardless of invocation method.
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Keep the build output at the repo-root dist/, alongside the esbuilt server.cjs
      // (server.ts's prod branch serves static assets from <root>/dist) — otherwise Vite
      // would default to FRONTEND/dist since this config file now lives in FRONTEND/.
      outDir: path.resolve(__dirname, '../dist'),
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // db.json and uploads/ are server-runtime data written on nearly every API request
      // (creating clients, posting journal entries, password resets, etc.) — without this
      // exclusion, every such write is picked up by Vite's watcher and forces a full browser
      // page reload for every connected client, wiping in-progress form state mid-action.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/db.json', '**/uploads/**'] },
    },
  };
});
