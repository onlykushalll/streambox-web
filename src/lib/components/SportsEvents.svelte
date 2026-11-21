<script lang="ts">
  // Aba "Eventos esportivos" da TV ao vivo: jogos e transmissões dos canais de esporte, tirados do EPG do Jellyfin.
  import { untrack } from 'svelte';
  import { url, authHeader, img, friendly } from '../api/jellyfin';
  import { CONFIG, session } from '../session.svelte';
  import { go } from '../router.svelte';
  import type { Item, ItemsResult } from '../types';
  import { hhmm } from '../util';
  import { classify } from '../channelGenres';
  import { setQueue, type LiveEntry } from '../liveQueue.svelte';
  import { buildEvents, cachedBadge, norm, teamBadge, type EventChannel, type EventSource, type SportEvent } from '../sportsGuide';

  let { channels, filter = '' }: { channels: Item[] | null; filter?: string } = $props();

  const sport = $derived((channels ?? []).filter((c) => classify(c.Name) === 'Esportes'));
  type Program = Item & { ChannelId?: string };
  let programs = $state<Program[] | null>(null);
  let error = $state('');
  let now = $state(Date.now());
  let onlyMatches = $state(false);
  let replays = $state(false);

  const parse = (s?: string) => (s ? Date.parse(s.endsWith('Z') ? s : s + 'Z') : NaN);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z';

  async function load(ids: string[]) {
    error = '';
    try {
      const out: Program[] = [];
      for (let i = 0; i < ids.length; i += 40) {
        const res = await fetch(url('/LiveTv/Programs', {
          userId: session.userId, channelIds: ids.slice(i, i + 40).join(','),
          minEndDate: iso(Date.now() - 24 * 3600_000), maxStartDate: iso(Date.now() + 72 * 3600_000),
          sortBy: 'StartDate', limit: 3000, enableImages: false, enableUserData: false, enableTotalRecordCount: false,
        }), { headers: { Authorization: authHeader(), Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Guia indisponível (HTTP ${res.status})`);
        out.push(...(((await res.json()) as ItemsResult).Items as Program[]));
      }
      programs = out;
    } catch (e) { error = friendly(e); if (!programs) programs = []; }
  }

  let loadedFor = '';
  $effect(() => {
    const ids = sport.map((c) => c.Id);
    const key = ids.join(',');
    if (channels && key !== loadedFor) { loadedFor = key; if (ids.length) load(ids); else programs = []; }
  });
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30000);
    return () => clearInterval(t);
  });

  const events = $derived.by(() => {
    const byId = new Map(sport.map((c) => [c.Id, c]));
    const src: EventSource[] = [];
    for (const p of programs ?? []) {
      const ch = p.ChannelId ? byId.get(p.ChannelId) : undefined;
      const a = parse(p.StartDate), b = parse(p.EndDate);
      if (!ch || isNaN(a) || isNaN(b)) continue;
      src.push({ title: p.Name, start: a, stop: b, channel: { key: ch.Id, name: ch.Name, logo: img.channel(ch), jfId: ch.Id, number: ch.ChannelNumber ?? null } });
    }
    return buildEvents(src, Math.floor(now / 60000) * 60000);
  });

  const q = $derived(filter.trim().toLowerCase());
  const shown = $derived(events.filter((e) => (!onlyMatches || e.home) && (replays || !e.replay) &&
    (!q || e.title.toLowerCase().includes(q) || (e.info ?? '').toLowerCase().includes(q) || e.channels.some((c) => c.name.toLowerCase().includes(q)))));

  const onAir = (e: SportEvent) => e.start <= now && e.stop > now;
  const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayDiff = (ms: number) => Math.round((dayStart(ms) - dayStart(now)) / 86400000);
  const dayLabel = (ms: number) => {
    const d = dayDiff(ms);
    return d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  };
  const sectionLabel = (ms: number) => {
    const date = new Date(ms).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    const d = dayDiff(ms);
    return d === 0 ? `Hoje · ${date}` : d === 1 ? `Amanhã · ${date}` : date.charAt(0).toUpperCase() + date.slice(1);
  };
  const sections = $derived.by(() => {
    const out: [string, SportEvent[]][] = [];
    const live = shown.filter(onAir);
    if (live.length) out.push(['Agora', live]);
    const days = new Map<number, SportEvent[]>();
    for (const e of shown) if (!onAir(e)) { const k = dayStart(e.start); days.set(k, [...(days.get(k) ?? []), e]); }
    for (const [k, list] of [...days.entries()].sort((a, b) => a[0] - b[0])) out.push([sectionLabel(k), list]);
    return out;
  });

  function play(e: SportEvent, ch: EventChannel = e.channels[0]) {
    // os canais do evento vão primeiro na fila do player; os outros canais de esporte vêm depois
    const main = e.channels.map((c): LiveEntry => ({
      name: c.name, logo: c.logo, number: c.number ?? null, jfId: c.jfId, group: 'Esportes',
      now: c.key === ch.key ? e.title : null,
      nowStart: c.key === ch.key && onAir(e) ? e.start : 0, nowEnd: c.key === ch.key && onAir(e) ? e.stop : 0,
    }));
    const others = sport.filter((c) => !e.channels.some((x) => x.jfId === c.Id)).map((c): LiveEntry => ({
      name: c.Name, logo: img.channel(c), number: c.ChannelNumber ?? null, jfId: c.Id, group: 'Esportes',
      now: c.CurrentProgram?.Name ?? null, nowStart: parse(c.CurrentProgram?.StartDate) || 0, nowEnd: parse(c.CurrentProgram?.EndDate) || 0,
    }));
    setQueue([...main, ...others]);
    go(`/live/jf/${ch.jfId}?name=${encodeURIComponent(ch.name)}`);
  }

  // Escudos: com o STRM Indexer vêm do repositório do servidor (prontos em disco, um só download para todos).
  // Sem ele, o navegador procura no TheSportsDB aos poucos.
  const server = !!CONFIG.indexer;
  const serverBadge = (t: string) => `${CONFIG.indexer}/badge?team=${encodeURIComponent(t)}`;
  let loadedOk = $state<Record<string, boolean>>({});
  let badges = $state<Record<string, string | null>>({});
  $effect(() => {
    if (server) return;
    const teams = [...new Set(shown.slice(0, 120).flatMap((e) => (e.home && e.away ? [e.home, e.away] : [])))];
    let alive = true;
    const next: Record<string, string | null> = {};
    for (const t of teams) { const c = cachedBadge(t); if (c !== undefined) next[norm(t)] = c; }
    untrack(() => (badges = { ...badges, ...next }));
    (async () => {
      for (const t of teams) {
        if (!alive) return;
        if (untrack(() => norm(t) in badges)) continue;
        const b = await teamBadge(t);
        if (alive && b !== null) badges = { ...badges, [norm(t)]: b };
        else if (alive && cachedBadge(t) !== undefined) badges = { ...badges, [norm(t)]: null };
      }
    })();
    return () => { alive = false; };
  });

  const COLORS = ['#2e7d32', '#1565c0', '#c62828', '#6a1b9a', '#00838f', '#ef6c00', '#37474f', '#4e342e'];
  const color = (t: string) => { let h = 0; for (const ch of norm(t)) h = (h * 31 + ch.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; };
  const initials = (t: string) => {
    const w = t.split(/[\s-]+/).filter((x) => /^[\p{L}\p{Nd}]/u.test(x));
    return (w.length >= 2 ? w[0][0] + w[1][0] : t.slice(0, 3)).toUpperCase();
  };
</script>

{#snippet team(name: string)}
  {@const b = server ? serverBadge(name) : badges[norm(name)]}
  {@const k = norm(name)}
  <span class="team">
    <span class="crestbox">
      {#if !loadedOk[k]}<span class="crest ini" style={`background:${color(name)}`}>{initials(name)}</span>{/if}
      {#if b}<img class="crest" class:hidden={!loadedOk[k]} src={b} alt="" loading="lazy" referrerpolicy="no-referrer"
        onload={() => (loadedOk[k] = true)} onerror={() => (loadedOk[k] = false)} />{/if}
    </span>
    <b>{name}</b>
  </span>
{/snippet}

{#if channels === null || (programs === null && sport.length)}
  <div class="center"><div class="spinner"></div><p>Montando o guia de eventos…</p></div>
{:else if !sport.length}
  <p class="muted">Nenhum canal de esportes encontrado. O guia de eventos usa a programação (EPG) dos canais de esporte.</p>
{:else}
  <div class="chips top">
    <button class="chip" class:on={!onlyMatches} onclick={() => (onlyMatches = false)}>Todos os eventos</button>
    <button class="chip" class:on={onlyMatches} onclick={() => (onlyMatches = true)}>Só jogos</button>
    <button class="chip" class:on={replays} onclick={() => (replays = !replays)}>{replays ? 'Reprises: mostrando' : 'Reprises: ocultas'}</button>
  </div>
  {#if server}<p class="credit">Escudos: <a href="https://football-logos.cc" target="_blank" rel="noopener">football-logos.cc</a></p>{/if}
  {#if error}<p class="bad">{error}</p>{/if}
  {#if !shown.length}<p class="muted">Nenhum evento nos próximos dias{q ? ` para "${filter}"` : ''}.</p>{/if}
  {#each sections as [label, list] (label)}
    <h2 class="day">{label}</h2>
    <div class="grid">
      {#each list as e (e.id)}
        {@const air = onAir(e)}
        <div class="ev" class:air role="button" tabindex="0" onclick={() => play(e)} onkeydown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), play(e))}>
          <div class="head">
            {#if air}<span class="tag live">AO VIVO</span>{:else if e.replay}<span class="tag">REPRISE</span>{:else if e.live}<span class="tag soon">AO VIVO</span>{/if}
            <span class="sp"></span>
            {#if e.channels[0].logo}<img class="chlogo" src={e.channels[0].logo} alt={e.channels[0].name} loading="lazy" />{/if}
          </div>
          {#if e.home && e.away}
            <div class="match">{@render team(e.home)}<span class="vs">x</span>{@render team(e.away)}</div>
          {:else}
            <div class="solo">
              <span class="big">{e.channels[0].name.slice(0, 2)}{#if e.channels[0].logo}<img src={e.channels[0].logo} alt="" loading="lazy" />{/if}</span>
              <strong>{e.title}</strong>
            </div>
          {/if}
          <div class="when">
            {#if e.info}<small>{e.info}</small>{/if}
            <span class:now={air}>{dayLabel(e.start)} · {hhmm(e.start)} – {hhmm(e.stop)}</span>
          </div>
          {#if air}<i class="bar2"><b style={`width:${Math.min(100, ((now - e.start) / (e.stop - e.start)) * 100)}%`}></b></i>{/if}
          {#if e.channels.length > 1}
            <div class="chs">
              {#each e.channels as c (c.key)}
                <button class="ch" onclick={(ev) => { ev.stopPropagation(); play(e, c); }}>{c.name}</button>
              {/each}
            </div>
          {:else}<small class="muted">{e.channels[0].name}</small>{/if}
        </div>
      {/each}
    </div>
  {/each}
{/if}

<style>
  .top{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
  .day{font-size:20px;margin:22px 0 10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  .ev{display:flex;flex-direction:column;gap:10px;background:var(--surface);border-radius:14px;padding:14px;cursor:pointer;transition:background .2s,box-shadow .2s;outline:none}
  .ev:hover,.ev:focus-visible{background:var(--surface2);box-shadow:0 0 0 2px var(--orange)}
  .ev.air{box-shadow:inset 0 0 0 1px rgba(255,122,0,.6)}
  .ev.air:hover,.ev.air:focus-visible{box-shadow:0 0 0 2px var(--orange)}
  .head{display:flex;align-items:center;gap:6px;min-height:22px}
  .sp{flex:1}
  .chlogo{height:22px;max-width:64px;object-fit:contain}
  .tag{font-size:11px;font-weight:800;letter-spacing:.04em;padding:2px 6px;border-radius:4px;background:var(--surface3);color:var(--muted)}
  .tag.live{background:var(--bad);color:#fff}
  .tag.soon{color:var(--orange)}
  .match{display:flex;align-items:center}
  .team{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
  .team b{font-size:14px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .crestbox{position:relative;width:60px;height:60px}
  .crest{position:absolute;inset:0;width:60px;height:60px;object-fit:contain}
  .crest.hidden{opacity:0}
  .credit{font-size:12px;color:var(--muted);margin:2px 0 0} .credit a{color:inherit}
  .ini{border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:16px}
  .vs{color:var(--orange);font-weight:800;font-size:22px;padding:0 6px}
  .solo{display:flex;gap:12px;align-items:center}
  .solo strong{display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .big{position:relative;flex:none;width:56px;height:56px;border-radius:10px;background:var(--surface3);display:grid;place-items:center;color:var(--orange);font-weight:800;text-transform:uppercase;overflow:hidden}
  .big img{position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);object-fit:contain;background:var(--surface3)}
  .when{display:flex;flex-direction:column;gap:2px}
  .when small{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .when span{font-weight:700}
  .when .now{color:var(--orange)}
  .bar2{display:block;height:3px;border-radius:2px;background:var(--surface3)} .bar2 b{display:block;height:100%;background:var(--orange)}
  .chs{display:flex;gap:6px;flex-wrap:wrap}
  .ch{border:0;border-radius:99px;background:var(--surface2);color:var(--text);font-size:12px;font-weight:600;padding:4px 10px;cursor:pointer}
  .ch:hover,.ch:focus-visible{background:var(--orange);color:#000;outline:none}
  @media (max-width:700px){.grid{grid-template-columns:1fr}}
</style>
