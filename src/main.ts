import 'sb-tv-polyfills';   // só no build de TV (vite.config.ts)
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initTv } from './lib/tv';

initTv();   // controle remoto, só em TV (build /tv/ ou navegador de TV)

export default mount(App, { target: document.getElementById('app')! });
