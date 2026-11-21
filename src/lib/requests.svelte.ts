// Pedidos do usuário (STRM Indexer e Seerr): os feitos neste navegador mais os que os servidores
// conhecem de outros aparelhos. Usado pela fileira "Seu pedido chegou" e pelo aviso de chegada.
import { jf, normalizeTitle } from './api/jellyfin';
import { indexer, seerr } from './api/extras';
import { session } from './session.svelte';
import type { Item } from './types';

export interface MyRequest {
  key: string;                    // origem:tipo:identificador
  source: 'strm' | 'seerr';
  kind: 'movie' | 'series';
  title: string;
  year?: number | null;
  time: number;
  tmdbId?: number;
  jellyfinId?: string | null;
}

const MAX_LOCAL = 100;
const MAX_AGE_MS = 2 * 60_000;
const storeKey = () => `sb_requests_${session.userId}`;

function readLocal(): MyRequest[] {
  try { return JSON.parse(localStorage.getItem(storeKey()) || '[]'); } catch { return []; }
}

class Requests {
  /** Sobe a cada pedido novo: a tela inicial recarrega a fileira. */
  version = $state(0);
  private cache: { user: string; at: number; items: Item[] } | null = null;

  record(r: Omit<MyRequest, 'key' | 'time'>) {
    const key = `${r.source}:${r.kind}:${r.tmdbId ?? normalizeTitle(r.title)}`;
    const list = [{ ...r, key, time: Date.now() }, ...readLocal().filter((x) => x.key !== key)].slice(0, MAX_LOCAL);
    try { localStorage.setItem(storeKey(), JSON.stringify(list)); } catch { /* cheio */ }
    this.cache = null;
    this.version++;
  }

  /** Títulos pedidos (normalizados), para reconhecer a chegada de um pedido. */
  requestedTitles(): Set<string> {
    return new Set(readLocal().map((r) => normalizeTitle(r.title)));
  }

  /** Todos os pedidos conhecidos, sem repetição. */
  private async all(): Promise<MyRequest[]> {
    const merged = new Map<string, MyRequest>();
    for (const r of readLocal()) merged.set(r.key, r);
    const [strm, sr] = await Promise.all([
      indexer.enabled() ? indexer.mine().catch(() => []) : Promise.resolve([]),
      seerr.identifiesUser() ? seerr.myRequests().catch(() => []) : Promise.resolve([]),
    ]);
    for (const r of strm) {
      const kind = r.kind === 'movie' ? 'movie' : 'series';
      const key = `strm:${kind}:${normalizeTitle(r.title)}`;
      if (!merged.has(key)) merged.set(key, { key, source: 'strm', kind, title: r.title, year: r.year, time: (r.created_at ?? 0) * 1000 });
    }
    await Promise.all(sr.map(async (e) => {
      const tmdb = e.media?.tmdbId;
      if (!tmdb) return;
      const tv = e.type === 'tv' || e.media?.mediaType === 'tv';
      const kind = tv ? 'series' : 'movie';
      const key = `seerr:${kind}:${tmdb}`;
      const known = merged.get(key);
      if (known) { known.jellyfinId = e.media?.jellyfinMediaId; return; }
      const d = await seerr.details(tv ? 'tv' : 'movie', tmdb).catch(() => null);
      if (!d) return;
      const title = d.title ?? d.name ?? '';
      const year = Number((d.releaseDate ?? d.firstAirDate ?? '').slice(0, 4)) || null;
      merged.set(key, { key, source: 'seerr', kind, title, year, tmdbId: tmdb, jellyfinId: e.media?.jellyfinMediaId, time: Date.parse(e.createdAt ?? '') || 0 });
    }));
    return [...merged.values()].sort((a, b) => b.time - a.time);
  }

  /** Pedidos que já estão no catálogo (mais recentes primeiro). Usa o resultado anterior por 2 min. */
  async arrived(force = false): Promise<Item[]> {
    const c = this.cache;
    if (!force && c && c.user === session.userId && Date.now() - c.at < MAX_AGE_MS) return c.items;
    const list = await this.all();
    const found = await Promise.all(list.slice(0, 40).map(async (r) => {
      if (r.jellyfinId) { const it = await jf.item(r.jellyfinId).catch(() => null); if (it) return it; }
      return jf.findTitle(r.title, r.kind, r.year).catch(() => null);
    }));
    const seen = new Set<string>();
    const items = found.filter((x): x is Item => !!x && !seen.has(x.Id) && !!seen.add(x.Id));
    this.cache = { user: session.userId, at: Date.now(), items };
    return items;
  }
}

export const requests = new Requests();
