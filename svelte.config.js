import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// No build de TV o CSS dos componentes passa pelo PostCSS depois do Svelte (ver vite.config.ts)
export default { preprocess: vitePreprocess({ style: process.env.SB_TV_BUILD !== '1' }) };
