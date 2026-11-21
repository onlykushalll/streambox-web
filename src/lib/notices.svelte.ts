// Avisos enquanto a página está aberta (como no app Android):
// - mensagens enviadas pelo painel do Jellyfin (WebSocket);
// - novidades do catálogo e "Seu pedido chegou" (confere a cada 15 min e quando a biblioteca muda).
// Aparecem como cartão na tela e, se a pessoa permitir, como notificação do navegador.
import { jf, img, episodeLabel, normalizeTitle, socketUrl } from './api/jellyfin';
import { seerr } from './api/extras';
import { requests } from './requests.svelte';
import { session } from './session.svelte';
import type { Item } from './types';

export type NoticeKind = 'message' | 'new' | 'requested';
export interface Notice { id: string; kind: NoticeKind; title: string; text: string; time: number; itemId?: string; image?: string | null; read?: boolean }

const CONTENT_INTERVAL_MS = 15 * 60_000;
const MAX_SINGLE = 3;
const MAX_HISTORY = 40;
const histKey = () => `sb_notices_${session.userId}`;
const baseKey = () => `sb_notice_base_${session.userId}`;
const uid = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2));
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio */ } };

class Notices {
  history = $state<Notice[]>([]);
  /** Cartões visíveis agora (somem sozinhos). */
  live = $state<Notice[]>([]);
  readonly unread = $derived(this.history.filter((n) => !n.read).length);
  permission = $state<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  private socket: WebSocket | null = null;
  private stopped = true;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private keepAlive: ReturnType<typeof setInterval> | undefined;
  private libraryCheck: ReturnType<typeof setTimeout> | undefined;
  private checking = false;
  private user = '';

  start() {
    if (!session.loggedIn || (!this.stopped && this.user === session.userId)) return;
    this.stop();
    this.stopped = false;
    this.user = session.userId;
    this.history = read<Notice[]>(histKey(), []);
    this.connect(5000);
    const loop = () => { this.checkContent().catch(() => {}); this.timers.push(setTimeout(loop, CONTENT_INTERVAL_MS)); };
    this.timers.push(setTimeout(loop, 8000));          // depois que a tela inicial carregou
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearTimeout); this.timers = [];
    clearInterval(this.keepAlive); clearTimeout(this.libraryCheck);
    this.socket?.close(); this.socket = null;
  }

  /* ---------------- tela ---------------- */

  post(n: Omit<Notice, 'id' | 'time'>) {
    const S = session.settings;
    if ((n.kind === 'new' && !S.noticeNew) || (n.kind === 'requested' && !S.noticeRequested)) return;
    const notice: Notice = { ...n, id: uid(), time: Date.now() };
    this.history = [notice, ...this.history].slice(0, MAX_HISTORY);
    write(histKey(), this.history);
    this.live = [...this.live, notice].slice(-3);
    setTimeout(() => this.dismiss(notice.id), n.kind === 'message' ? 15000 : 9000);
    this.system(notice);
  }

  dismiss(id: string) { this.live = this.live.filter((n) => n.id !== id); }
  markAllRead() { this.history = this.history.map((n) => ({ ...n, read: true })); write(histKey(), this.history); }
  clear() { this.history = []; write(histKey(), []); }

  /** Notificação do sistema: só quando a pessoa permitiu e a aba não está na frente (ou está em tela cheia). */
  private system(n: Notice) {
    if (this.permission !== 'granted' || !session.settings.notifyBrowser) return;
    if (!document.hidden && !document.fullscreenElement) return;
    try {
      const sys = new Notification(n.title, { body: n.text, icon: n.image ?? '/icon.svg', tag: n.id });
      sys.onclick = () => { focus(); if (n.itemId) location.hash = `#/item/${n.itemId}`; sys.close(); };
    } catch { /* alguns celulares só permitem pelo service worker */ }
  }

  async askPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    this.permission = await Notification.requestPermission();
    return this.permission === 'granted';
  }

  /* ---------------- tempo real ---------------- */

  private connect(wait: number) {
    if (this.stopped || !session.token) return;
    let ws: WebSocket;
    try { ws = new WebSocket(socketUrl()); } catch { return; }
    this.socket = ws;
    ws.onopen = () => { wait = 5000; jf.reportCapabilities().catch(() => {}); };
    ws.onmessage = (ev) => {
      let msg: { MessageType?: string; Data?: any };
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.MessageType) {
        case 'ForceKeepAlive': {
          const s = Math.max(2, Number(msg.Data) || 60);
          clearInterval(this.keepAlive);
          this.keepAlive = setInterval(() => ws.readyState === 1 && ws.send('{"MessageType":"KeepAlive"}'), s * 500);
          break;
        }
        case 'GeneralCommand': this.showMessage(msg.Data); break;
        case 'LibraryChanged':
          // uma varredura manda vários eventos seguidos: confere só depois que acalmar
          if (msg.Data?.ItemsAdded?.length) {
            clearTimeout(this.libraryCheck);
            this.libraryCheck = setTimeout(() => this.checkContent().catch(() => {}), 60_000);
          }
          break;
      }
    };
    ws.onclose = () => {
      clearInterval(this.keepAlive);
      if (this.socket !== ws || this.stopped) return;
      this.timers.push(setTimeout(() => this.connect(Math.min(wait * 2, 300_000)), wait));
    };
  }

  private showMessage(cmd: any) {
    if (cmd?.Name !== 'DisplayMessage') return;
    const text = String(cmd.Arguments?.Text ?? '');
    const header = String(cmd.Arguments?.Header ?? '');
    if (!text.trim() && !header.trim()) return;
    const title = !header.trim() || /^message from server$/i.test(header) ? 'Mensagem do servidor' : header;
    this.post({ kind: 'message', title, text });
  }

  /* ---------------- novidades do catálogo ---------------- */

  private async checkContent() {
    if (this.checking || !session.loggedIn) return;
    this.checking = true;
    try {
      const stamp = (i: Item) => (i.DateCreated ?? '').slice(0, 19);
      const latest = await jf.recentlyAdded();
      const newest = latest.map(stamp).sort().pop() ?? '';
      if (!newest) return;
      const base = read<{ at: string; seen: string[] }>(baseKey(), { at: '', seen: [] });
      // primeira vez neste navegador: só marca o ponto de partida, sem avisar do catálogo inteiro
      const fresh = base.at ? latest.filter((i) => stamp(i) >= base.at && !base.seen.includes(i.Id)) : [];
      write(baseKey(), { at: newest, seen: latest.filter((i) => stamp(i) === newest).map((i) => i.Id) });
      if (!fresh.length) return;
      const groups = new Map<string, Item[]>();
      for (const i of fresh) {
        const k = i.SeriesId ?? (i.SeriesName ? 'name:' + normalizeTitle(i.SeriesName) : i.Id);
        groups.set(k, [...(groups.get(k) ?? []), i]);
      }
      const arrivals = await Promise.all([...groups.values()].map((g) => this.describe(g, base.at)));
      await this.announce(arrivals);
    } finally { this.checking = false; }
  }

  private async describe(group: Item[], baseline: string) {
    const first = group[0];
    const isEp = first.Type === 'Episode' || !!first.SeriesId || !!first.SeriesName;
    if (!isEp) return { owner: first, series: false, title: 'Novo filme', text: [first.Name, first.ProductionYear].filter(Boolean).join(' · ') };
    const series = first.SeriesId ? await jf.item(first.SeriesId).catch(() => null) : null;
    const owner = series ?? first;
    const name = series?.Name ?? first.SeriesName ?? first.Name;
    const newSeries = !!series?.DateCreated && series.DateCreated.slice(0, 19) >= baseline;
    const eps = group.filter((e) => e.Type === 'Episode').sort((a, b) => (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
    const seasons = [...new Set(eps.map((e) => e.ParentIndexNumber).filter((n): n is number => n != null))];
    const season = seasons.length === 0 ? '' : seasons.length === 1 ? `Temporada ${seasons[0]}` : `Temporadas ${seasons[0]}–${seasons[seasons.length - 1]}`;
    const count = (n: number) => (n === 1 ? '1 episódio' : `${n} episódios`);
    const [title, detail] = newSeries ? ['Nova série', [season, eps.length ? count(eps.length) : ''].filter(Boolean).join(' · ')]
      : eps.length === 1 ? ['Novo episódio', episodeLabel(eps[0])]
      : ['Novos episódios', [count(Math.max(eps.length, group.length)), season].filter(Boolean).join(' · ')];
    return { owner, series: true, title, text: [name, detail].filter(Boolean).join(' · ') };
  }

  private async announce(arrivals: { owner: Item; series: boolean; title: string; text: string }[]) {
    const titles = requests.requestedTitles();
    const tmdbIds = new Set<number>();
    if (seerr.identifiesUser()) (await seerr.myRequests(200).catch(() => [])).forEach((r) => r.media?.tmdbId && tmdbIds.add(r.media.tmdbId));
    const isRequested = (a: { owner: Item }) => {
      if (titles.has(normalizeTitle(a.owner.SeriesName ?? a.owner.Name))) return true;
      const t = Number(a.owner.ProviderIds?.Tmdb);
      return !!t && tmdbIds.has(t);
    };
    const poster = (i: Item) => img.poster(i, 240);
    const asked = arrivals.filter(isRequested);
    asked.forEach((a) => this.post({ kind: 'requested', title: 'Seu pedido chegou', text: a.text, itemId: a.owner.Id, image: poster(a.owner) }));
    if (asked.length) requests.version++;
    const others = arrivals.filter((a) => !asked.includes(a));
    if (others.length <= MAX_SINGLE) {
      others.forEach((a) => this.post({ kind: 'new', title: a.title, text: a.text, itemId: a.owner.Id, image: poster(a.owner) }));
      return;
    }
    const movies = others.filter((a) => !a.series).length, shows = others.length - movies;
    const counts = [movies ? (movies === 1 ? '1 filme' : `${movies} filmes`) : '', shows ? (shows === 1 ? '1 série' : `${shows} séries`) : ''].filter(Boolean).join(' e ');
    const names = others.slice(0, 3).map((a) => a.owner.SeriesName ?? a.owner.Name).join(', ');
    this.post({ kind: 'new', title: 'Novidades no catálogo', text: `${counts} · ${names}${others.length > 3 ? ` e mais ${others.length - 3}` : ''}`, image: poster(others[0].owner) });
  }
}

export const notices = new Notices();
