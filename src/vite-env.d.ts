/// <reference types="svelte" />
/// <reference types="vite/client" />
interface Window {
  STREAMBOX?: { jellyfin?: string; indexer?: string; seerr?: string; title?: string; whatsapp?: string; whatsappLabel?: string; downloads?: string };
}

declare module 'sb-tv-polyfills';
declare module 'flex-gap-polyfill';
