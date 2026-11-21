// Polyfills do build de TV (Chromium 56–69). No build normal, "sb-tv-polyfills" aponta para um arquivo vazio.
import { ResizeObserver as RO } from '@juggle/resize-observer';

const w = window as unknown as Record<string, unknown>;
// Chromium 64+: usado pelo Svelte em bind:clientWidth e afins
if (!w.ResizeObserver) w.ResizeObserver = RO;

// matchMedia(...).addEventListener('change') só existe nos navegadores mais novos
const MQL = w.MediaQueryList as { prototype: MediaQueryList } | undefined;
if (MQL && !MQL.prototype.addEventListener) {
  const p = MQL.prototype as MediaQueryList & {
    addListener(f: (e: MediaQueryListEvent) => void): void; removeListener(f: (e: MediaQueryListEvent) => void): void;
  };
  p.addEventListener = function (this: typeof p, type: string, f: EventListenerOrEventListenerObject) {
    if (type === 'change') this.addListener(f as (e: MediaQueryListEvent) => void);
  } as typeof p.addEventListener;
  p.removeEventListener = function (this: typeof p, type: string, f: EventListenerOrEventListenerObject) {
    if (type === 'change') this.removeListener(f as (e: MediaQueryListEvent) => void);
  } as typeof p.removeEventListener;
}
