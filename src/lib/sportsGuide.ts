// Guia de eventos esportivos montado a partir do EPG dos canais de esporte (mesmas regras do app Android).
// Só entra o que parece um evento: jogos ("Time A x Time B") e transmissões marcadas "Ao Vivo"
// de corridas, lutas, ligas etc. Programas de debate e noticiário ficam de fora.

export interface EventChannel { key: string; name: string; logo: string | null; jfId?: string; number?: string | null }

export interface SportEvent {
  id: string;
  title: string;            // "Flamengo x Palmeiras" ou "MotoGP: GP de Portugal"
  home: string | null;      // times (só em jogos)
  away: string | null;
  info: string | null;      // fase / campeonato
  start: number;
  stop: number;
  live: boolean;            // o EPG marca "Ao Vivo"
  replay: boolean;          // "VT", reprise
  channels: EventChannel[];
}

export interface EventSource { title: string; start: number; stop: number; channel: EventChannel }

const VERSUS = /^(.+?)\s+(?:x|×|vs\.?|versus)\s+(.+)$/i;
const LIVE = /[\s\-–:(]*\bao vivo\b[\s)]*/gi;
const REPLAY = /^\s*(?:vt|reprise|compacto|melhores momentos)\s*[-–:]\s*|\s*[-–(]\s*(?:vt|reprise)\s*\)?\s*$/i;
const NOT_TEAM = /^(d[aeo]s?|em|no|na|para|com)\s/i;
const EVENT_WORDS = new RegExp(
  '(^|[^\\p{L}])(gp|grande pr[eê]mio|f[oó]rmula|f1|f2|f3|motogp|moto ?[23]|stock car|nascar|indy|rally|nfl|nba|nhl|mlb|wnba|ncaa|ufc|' +
  'boxe|luta|mma|bellator|pfl|t[eê]nis|atp|wta|v[oô]lei|basquete|handebol|futsal|corrida|etapa|final|semifinal|' +
  'quartas|copa|campeonato|liga|ta[cç]a|torneio|grand slam|open|golfe|pga|surf|wsl|ciclismo|tour|maratona|' +
  'ol[ií]mpi\\p{L}*|mundial|jogo|partida|rodada|supercopa|libertadores|sul-?americana|champions|premier|brasileir[aã]o)(?![\\p{L}])', 'iu');
const SHOWS = new RegExp(
  '(^|[^\\p{L}])(sportscenter|news|resenha|linha de passe|reda[cç][aã]o|giro|abre o jogo|pr[eé]-jogo|p[oó]s-jogo|depois do jogo|' +
  'aquecimento|t[aá] on|bola da vez|troca de passes|sele[cç][aã]o sportv|fechamento|esporte total|tempo t[eé]cnico|' +
  'momentos?|ol[eé]+ s\\.?a|equipe f|baú|bau do esporte|programa[cç][aã]o|stories|inside line|this week|action|' +
  'especial|document[aá]rio|filmes?|film|mesa-redonda|debate|entrevista|bate-papo|show|replay|highlights|redzone)(?![\\p{L}])', 'iu');

export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const cleanTeam = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim().replace(/^[-–:,\s]+|[-–:,\s]+$/g, '');

export interface Parsed { title: string; home: string | null; away: string | null; info: string | null; live: boolean; replay: boolean }

/** Lê o título do EPG. Null quando não é um evento (programa de estúdio, noticiário…). */
export function parseTitle(raw: string): Parsed | null {
  let t = raw.trim();
  const live = /\bao vivo\b/i.test(t);
  t = t.replace(LIVE, ' ').trim();
  const replay = REPLAY.test(t);
  t = t.replace(REPLAY, '').trim().replace(/^[-–:\s]+|[-–:\s]+$/g, '');
  if (!t) return null;
  const parts = t.split(/\s+[-–|]\s+|\s*:\s+/).map((p) => p.trim()).filter(Boolean);
  const matchPart = parts.find((p) => VERSUS.test(p) && p.length <= 80);
  if (matchPart) {
    const m = VERSUS.exec(matchPart)!;
    const home = cleanTeam(m[1]), away = cleanTeam(m[2]);
    if (home && away && home.length <= 40 && away.length <= 40 && !NOT_TEAM.test(away)) {
      const key = norm(matchPart);
      const info = [...new Set(parts.filter((p) => norm(p) !== key && !norm(p).includes(norm(home))))].join(' · ') || null;
      return { title: `${home} x ${away}`, home, away, info, live, replay };
    }
  }
  if (SHOWS.test(t) || !EVENT_WORDS.test(t)) return null;
  return { title: t, home: null, away: null, info: null, live, replay };
}

/**
 * Monta os eventos: junta blocos seguidos do mesmo evento no mesmo canal, junta o mesmo evento em
 * vários canais e marca como reprise o que já passou antes (os canais nem sempre escrevem "VT").
 * Mande também as últimas 24 h do guia, para saber o que já passou. Só voltam os que não terminaram.
 */
export function buildEvents(sources: EventSource[], now = Date.now()): SportEvent[] {
  const out: SportEvent[] = [];
  const firstSeen = new Map<string, number>();        // primeira exibição de cada evento
  const lastOnChannel = new Map<string, SportEvent>(); // canal + evento → último bloco (para juntar blocos seguidos)
  for (const src of [...sources].sort((a, b) => a.start - b.start)) {
    const p = parseTitle(src.title);
    if (!p) continue;
    const key = norm(p.title);
    const prev = lastOnChannel.get(src.channel.key + '|' + key);
    if (prev && src.start - prev.stop <= 5 * 60_000) { prev.stop = Math.max(prev.stop, src.stop); prev.live ||= p.live; continue; }
    const first = firstSeen.get(key);
    if (first === undefined) firstSeen.set(key, src.start);
    const replay = p.replay || (!p.live && first !== undefined && src.start - first > 45 * 60_000);
    let e = out.find((x) => norm(x.title) === key && x.replay === replay && Math.abs(x.start - src.start) <= 45 * 60_000);
    if (e) {
      if (!e.channels.some((c) => c.key === src.channel.key)) e.channels.push(src.channel);
      e.live ||= p.live; e.info ??= p.info; e.stop = Math.max(e.stop, src.stop);
    } else {
      e = { id: `${key}@${src.start}`, title: p.title, home: p.home, away: p.away, info: p.info,
        start: src.start, stop: src.stop, live: p.live, replay, channels: [src.channel] };
      out.push(e);
    }
    lastOnChannel.set(src.channel.key + '|' + key, e);
  }
  return out.filter((e) => e.stop > now).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

/* ---------------- escudos (TheSportsDB) ---------------- */
// A chave pública aceita poucas consultas por minuto: vão uma de cada vez e o resultado fica guardado
// no navegador (escudo para sempre, "não achei" por 7 dias).

const API = 'https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=';
const STORE = 'sb.teamBadges';
const GAP_MS = 2200, MISS_TTL = 7 * 24 * 3600_000;

const ALIASES: Record<string, string> = {
  atleticomg: 'Atletico Mineiro', atleticomineiro: 'Atletico Mineiro', galo: 'Atletico Mineiro',
  atleticopr: 'Athletico Paranaense', athleticopr: 'Athletico Paranaense', athletico: 'Athletico Paranaense',
  atleticogo: 'Atletico Goianiense', americamg: 'America Mineiro', americarn: 'America RN',
  bragantino: 'Bragantino', rbbragantino: 'Bragantino', redbullbragantino: 'Bragantino',
  vasco: 'Vasco da Gama', sport: 'Sport Recife', sportrecife: 'Sport Recife',
  botafogosp: 'Botafogo SP', botafogorj: 'Botafogo', internacional: 'Internacional', inter: 'Internacional',
  intermilao: 'Inter Milan', internazionale: 'Inter Milan', milan: 'AC Milan', juventus: 'Juventus',
  bayern: 'Bayern Munich', bayerndemunique: 'Bayern Munich', psg: 'Paris SG', parissaintgermain: 'Paris SG',
  manchesterunited: 'Manchester United', manutd: 'Manchester United', tottenham: 'Tottenham Hotspur',
  brighton: 'Brighton and Hove Albion', brightonhovealbion: 'Brighton and Hove Albion',
  wolverhampton: 'Wolverhampton Wanderers', wolves: 'Wolverhampton Wanderers', newcastle: 'Newcastle United',
  westham: 'West Ham United', leeds: 'Leeds United', nottinghamforest: 'Nottingham Forest',
  atleticodemadri: 'Atletico Madrid', atleticomadri: 'Atletico Madrid', atleticodemadrid: 'Atletico Madrid',
  barcelona: 'Barcelona', realmadri: 'Real Madrid', sevilha: 'Sevilla', betis: 'Real Betis',
  roma: 'AS Roma', napoles: 'Napoli', lazio: 'Lazio', fiorentina: 'Fiorentina',
  borussiadortmund: 'Borussia Dortmund', dortmund: 'Borussia Dortmund', leverkusen: 'Bayer Leverkusen',
  benfica: 'Benfica', porto: 'FC Porto', sporting: 'Sporting CP', ajax: 'Ajax',
  riverplate: 'River Plate', bocajuniors: 'Boca Juniors', penarol: 'Penarol', nacional: 'Nacional',
  ldu: 'LDU Quito', olimpia: 'Olimpia', cerroporteno: 'Cerro Porteno', independientedelvalle: 'Independiente del Valle',
  brasil: 'Brazil', argentina: 'Argentina', alemanha: 'Germany', franca: 'France', inglaterra: 'England',
  espanha: 'Spain', italia: 'Italy', holanda: 'Netherlands', paisesbaixos: 'Netherlands',
  uruguai: 'Uruguay', colombia: 'Colombia', chile: 'Chile', paraguai: 'Paraguay', peru: 'Peru',
  equador: 'Ecuador', venezuela: 'Venezuela', bolivia: 'Bolivia', mexico: 'Mexico', estadosunidos: 'USA',
  eua: 'USA', japao: 'Japan', coreiadosul: 'South Korea', marrocos: 'Morocco', belgica: 'Belgium',
  croacia: 'Croatia', suica: 'Switzerland', dinamarca: 'Denmark', suecia: 'Sweden', noruega: 'Norway',
  polonia: 'Poland', escocia: 'Scotland', gales: 'Wales', irlanda: 'Ireland', turquia: 'Turkey',
  senegal: 'Senegal', camaroes: 'Cameroon', nigeria: 'Nigeria', gana: 'Ghana', egito: 'Egypt',
  australia: 'Australia', canada: 'Canada', arabiasaudita: 'Saudi Arabia', catar: 'Qatar',
};

type Stored = Record<string, [string, number]>;
function readStore(): Stored {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') as Stored; } catch { return {}; }
}
function writeStore(s: Stored) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* sem espaço / modo privado */ }
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').trim();
const store = readStore();
let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0, pausedUntil = 0;
const pending = new Map<string, Promise<string | null>>();

/** Escudo já guardado (undefined = ainda não procurado). */
export function cachedBadge(team: string): string | null | undefined {
  const hit = store[norm(team)];
  if (!hit) return undefined;
  if (!hit[0] && Date.now() - hit[1] > MISS_TTL) return undefined;
  return hit[0] || null;
}

/** "" = não achou; null = não deu para consultar agora. */
async function query(name: string): Promise<string | null> {
  const wait = Math.max(lastCall + GAP_MS, pausedUntil) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const res = await fetch(API + encodeURIComponent(name));
    const text = await res.text();
    if (!res.ok || !text.trimStart().startsWith('{')) { pausedUntil = Date.now() + 60_000; return null; }
    const teams: any[] = JSON.parse(text).teams || [];
    const best = teams.find((t) => t.strSport === 'Soccer') ?? teams[0];
    const badge: string | undefined = best?.strBadge;
    return badge && badge.startsWith('http') ? badge + '/small' : '';
  } catch { return null; }
}

/** Procura o escudo do time, uma consulta de cada vez. */
export function teamBadge(team: string): Promise<string | null> {
  const key = norm(team);
  const c = cachedBadge(team);
  if (!key || c !== undefined) return Promise.resolve(c ?? null);
  const running = pending.get(key);
  if (running) return running;
  const job = (chain = chain.then(async () => {
    const again = cachedBadge(team);
    if (again !== undefined) return again;
    const base = plain(team).replace(/[-\s]+[A-Za-z]{2}$/, '').replace(/\s+(EC|FC|SC|AC|CF)$/i, '');
    const tries = [...new Set([ALIASES[key], plain(team), base].filter(Boolean) as string[])];
    let found = '';
    for (const q of tries) {
      const r = await query(q);
      if (r === null) return null;       // limite atingido: tenta de novo depois
      if (r) { found = r; break; }
    }
    store[key] = [found, Date.now()];
    writeStore(store);
    return found || null;
  })) as Promise<string | null>;
  pending.set(key, job);
  job.finally(() => pending.delete(key));
  return job;
}
