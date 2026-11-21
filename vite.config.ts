import { defineConfig, type Plugin as VitePlugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath } from 'node:url';
import tvPostcss from './tv-postcss.js';

// Em desenvolvimento, os mesmos caminhos do nginx de produção são repassados:
//   /api      -> Jellyfin
//   /strm-api -> STRM Indexer (ponte /jf)
//   /seerr    -> Seerr/Jellyseerr
const JELLYFIN = process.env.JELLYFIN_URL ?? 'http://127.0.0.1:8096';
const INDEXER = process.env.INDEXER_URL ?? 'http://127.0.0.1:8794';
const SEERR = process.env.SEERR_URL ?? 'http://127.0.0.1:5055';

/*
 * Build de TV (vite build --mode tv -> dist-tv, servido em /tv/): para o navegador das TVs Samsung
 * 2018–2020 (Chromium 56–69). JavaScript transpilado com polyfills (plugin-legacy) e CSS sem o que
 * esses navegadores não entendem. O build normal (dist) não muda.
 */
const TV_TARGETS = ['chrome >= 56'];

// Na TV a página é desenhada em 1280 px de largura e a TV amplia (letras e cartões maiores de longe)
const tvViewport = (): VitePlugin => ({
  name: 'tv-viewport',
  transformIndexHtml: (html) => html.replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=1280, user-scalable=no" />',
  ),
});

export default defineConfig(({ mode }) => {
  const tv = mode === 'tv';
  // Na TV o PostCSS roda no CSS final de cada componente (depois do Svelte); antes, o Svelte
  // descartaria as regras do polyfill (.no-flexgap ...) como "não usadas" (lido pelo svelte.config.js)
  if (tv) process.env.SB_TV_BUILD = '1';
  return {
    base: tv ? '/tv/' : '/',
    resolve: {
      alias: { 'sb-tv-polyfills': fileURLToPath(new URL(tv ? './src/lib/tv-polyfills.ts' : './src/lib/tv-polyfills-none.ts', import.meta.url)) },
    },
    plugins: [
      svelte(),
      ...(tv ? [legacy({ targets: TV_TARGETS, renderModernChunks: false }), tvViewport()] : []),
    ],
    css: tv ? {
      postcss: { plugins: [tvPostcss()] },
    } : undefined,
    build: tv
      ? { outDir: 'dist-tv', cssTarget: 'chrome56', chunkSizeWarningLimit: 1500 }
      : { target: 'es2020', chunkSizeWarningLimit: 600 },
    server: {
      proxy: {
        '/api': { target: JELLYFIN, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        '/strm-api': { target: INDEXER, changeOrigin: true },
        '/seerr': { target: SEERR, changeOrigin: true, rewrite: (p) => p.replace(/^\/seerr/, '') },
      },
    },
  };
});
