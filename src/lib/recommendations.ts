// "Para você que assistiu X": parte do que a pessoa viu por último (filmes e séries) e junta os
// títulos parecidos do Jellyfin. Se vierem poucos, completa com não vistos dos mesmos gêneros.
// Sem histórico, não devolve nada. (Mesma lógica do app Android.)
import { jf } from './api/jellyfin';
import type { Item } from './types';

const MIN_ITEMS = 4;
type Source = { id: string; name: string; type: 'Movie' | 'Series'; genres: string[] };

async function similarTo(src: Source, limit: number): Promise<Item[]> {
  const similar = (await jf.similar(src.id, limit).catch(() => [] as Item[]))
    .filter((i) => (i.Type === 'Movie' || i.Type === 'Series') && !i.UserData?.Played);
  if (similar.length >= 10) return similar;
  const genres = src.genres.length ? src.genres : (await jf.item(src.id).catch(() => null))?.Genres ?? [];
  if (!genres.length) return similar;
  const byGenre = await jf.byGenres(genres.slice(0, 3), src.type, limit).catch(() => [] as Item[]);
  const ids = new Set(similar.map((i) => i.Id));
  return [...similar, ...byGenre.filter((i) => !ids.has(i.Id))];
}

export async function forYou(resume: Item[], maxRows = 2, perRow = 16): Promise<[string, Item[]][]> {
  const played = await jf.recentlyPlayed().catch(() => [] as Item[]);
  const history = [...played, ...resume].sort((a, b) => (b.UserData?.LastPlayedDate ?? '').localeCompare(a.UserData?.LastPlayedDate ?? ''));
  const sources = new Map<string, Source>();
  for (const i of history) {
    let src: Source | null = null;
    if (i.Type === 'Episode' && i.SeriesId && i.SeriesName) src = { id: i.SeriesId, name: i.SeriesName, type: 'Series', genres: [] };
    else if (i.Type === 'Movie') src = { id: i.Id, name: i.Name, type: 'Movie', genres: i.Genres ?? [] };
    if (src && !sources.has(src.id)) sources.set(src.id, src);
  }
  if (!sources.size) return [];

  // Nunca sugerir o que a pessoa já viu ou está vendo
  const seen = new Set([...sources.keys(), ...resume.map((r) => r.SeriesId ?? r.Id)]);
  const rows = await Promise.all([...sources.values()].slice(0, maxRows + 1).map(async (s) => [s.name, await similarTo(s, perRow * 2).catch(() => [])] as [string, Item[]]));
  const used = new Set<string>();
  return rows
    .map(([name, list]): [string, Item[]] => [name, list.filter((i) => !seen.has(i.Id) && !i.UserData?.Played && !used.has(i.Id) && !!used.add(i.Id)).slice(0, perRow)])
    .filter(([, l]) => l.length >= MIN_ITEMS)
    .slice(0, maxRows);
}
