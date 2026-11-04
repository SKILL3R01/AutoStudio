/**
 * YouTube Data API v3 + Analytics client for the Growth section.
 * Public data uses the user's own API key; "my channel" features use a Google sign-in token (desktop app).
 * Every call is counted against the daily quota (10,000 units by default) and cached to save quota.
 */
import { create } from 'zustand';

export interface Video {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumb: string;
  views: number;
  likes: number;
  comments: number;
  /** Seconds. */
  duration: number;
}

export interface Channel {
  id: string;
  title: string;
  handle?: string;
  thumb: string;
  subs: number;
  views: number;
  videos: number;
  uploads?: string;
  publishedAt: string;
  country?: string;
}

const QUOTA_COST: Record<string, number> = { search: 100, videos: 1, channels: 1, playlistItems: 1, videoCategories: 1, 'videos.update': 50 };
export const DAILY_QUOTA = 10_000;

/** Quota resets at midnight Pacific time. */
const quotaDay = () => new Date(Date.now() - 8 * 3600_000).toISOString().slice(0, 10);

interface YtState {
  key: string;
  used: number;
  day: string;
  setKey: (k: string) => void;
  spend: (units: number) => void;
}

const saved = JSON.parse(globalThis.localStorage?.getItem('yt') ?? '{}');
export const useYt = create<YtState>((set, get) => ({
  key: saved.key ?? '',
  used: saved.day === quotaDay() ? saved.used ?? 0 : 0,
  day: quotaDay(),
  setKey: (key) => {
    set({ key: key.trim() });
    localStorage.setItem('yt', JSON.stringify({ ...get(), key: key.trim() }));
  },
  spend: (units) => {
    const day = quotaDay();
    const used = (get().day === day ? get().used : 0) + units;
    set({ used, day });
    localStorage.setItem('yt', JSON.stringify({ key: get().key, used, day }));
  },
}));

/** Base URLs (overridable for tests via localStorage `ytBase`). */
const base = () => globalThis.localStorage?.getItem('ytBase') ?? 'https://www.googleapis.com';
const DATA = () => `${base()}/youtube/v3`;
const ANALYTICS = () => (globalThis.localStorage?.getItem('ytBase') ? `${base()}/youtubeanalytics/v2` : 'https://youtubeanalytics.googleapis.com/v2');

// ---------- cache ----------
const CACHE_KEY = 'ytCache';
type CacheEntry = { t: number; v: unknown };
function cacheGet<T>(k: string, ttlH: number): T | undefined {
  const all: Record<string, CacheEntry> = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  const e = all[k];
  return e && Date.now() - e.t < ttlH * 3600_000 ? (e.v as T) : undefined;
}
function cacheSet(k: string, v: unknown) {
  const all: Record<string, CacheEntry> = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  all[k] = { t: Date.now(), v };
  const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
  for (const old of keys.slice(150)) delete all[old];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

export class YtError extends Error {}

/** Signed-in requests get the OAuth token from the desktop app; public ones use the API key. */
async function authHeaders(oauth: boolean): Promise<Record<string, string>> {
  if (!oauth) return {};
  const token = await window.autostudio?.google?.token();
  if (!token) throw new YtError('Sign in with Google first (Growth → My channel).');
  return { Authorization: `Bearer ${token}` };
}

async function call<T>(endpoint: string, params: Record<string, string | number | undefined>, opts: { oauth?: boolean; ttlH?: number; analytics?: boolean } = {}): Promise<T> {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const cacheKey = `${opts.oauth ? 'me:' : ''}${endpoint}?${q}`;
  const ttl = opts.ttlH ?? 6;
  if (ttl > 0) {
    const hit = cacheGet<T>(cacheKey, ttl);
    if (hit) return hit;
  }
  const { key } = useYt.getState();
  if (!opts.oauth) {
    if (!key) throw new YtError('Add your YouTube API key first (Growth → Setup).');
    q.set('key', key);
  }
  const url = `${opts.analytics ? ANALYTICS() : DATA()}/${endpoint}?${q}`;
  const r = await fetch(url, { headers: await authHeaders(!!opts.oauth) });
  // Failed requests cost Google ~1 unit, not the full price of the call.
  if (!opts.analytics) useYt.getState().spend(r.ok ? QUOTA_COST[endpoint] ?? 1 : 1);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? r.status;
    const raw = String(j.error?.message ?? '');
    const msg = /are blocked|API_KEY_SERVICE_BLOCKED/i.test(raw) || j.error?.details?.some?.((d: { reason?: string }) => d.reason === 'API_KEY_SERVICE_BLOCKED')
      ? 'This API key is restricted to other APIs. Google Cloud → Credentials → your key → API restrictions → tick "YouTube Data API v3" (or "Don\'t restrict key") → Save, wait 2–5 minutes, then test again.'
      : reason === 'quotaExceeded' ? 'Daily YouTube quota used up — it resets at midnight Pacific time.'
      : reason === 'keyInvalid' || r.status === 400 && /API key/i.test(j.error?.message ?? '') ? 'The API key is not valid — check it in Growth → Setup.'
      : reason === 'accessNotConfigured' ? 'Enable "YouTube Data API v3" for this key in Google Cloud Console.'
      : j.error?.message ?? `YouTube API error ${r.status}`;
    throw new YtError(msg);
  }
  if (ttl > 0) cacheSet(cacheKey, j);
  return j as T;
}

// ---------- parsing ----------
/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function isoDuration(s: string): number {
  const m = s.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0);
}

const thumbOf = (t: any) => t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? '';
const toVideo = (v: any): Video => ({
  id: v.id, title: v.snippet?.title ?? '', description: v.snippet?.description ?? '', tags: v.snippet?.tags ?? [], categoryId: v.snippet?.categoryId ?? '22',
  channelId: v.snippet?.channelId ?? '', channelTitle: v.snippet?.channelTitle ?? '', publishedAt: v.snippet?.publishedAt ?? '', thumb: thumbOf(v.snippet?.thumbnails),
  views: +(v.statistics?.viewCount ?? 0), likes: +(v.statistics?.likeCount ?? 0), comments: +(v.statistics?.commentCount ?? 0), duration: isoDuration(v.contentDetails?.duration ?? ''),
});
const toChannel = (c: any): Channel => ({
  id: c.id, title: c.snippet?.title ?? '', handle: c.snippet?.customUrl, thumb: thumbOf(c.snippet?.thumbnails), subs: +(c.statistics?.subscriberCount ?? 0),
  views: +(c.statistics?.viewCount ?? 0), videos: +(c.statistics?.videoCount ?? 0), uploads: c.contentDetails?.relatedPlaylists?.uploads, publishedAt: c.snippet?.publishedAt ?? '',
  country: c.snippet?.country,
});

/** Accepts @handle, a channel URL (/@x, /channel/UC…) or a raw UC… id. */
export function parseChannelRef(input: string): { id?: string; handle?: string } | null {
  const s = input.trim();
  if (!s) return null;
  const id = s.match(/(UC[\w-]{22})/);
  if (id) return { id: id[1] };
  const h = s.match(/@([\w.\-]{3,})/);
  if (h) return { handle: `@${h[1]}` };
  if (/^[\w.\-]{3,}$/.test(s)) return { handle: `@${s}` };
  return null;
}

// ---------- API ----------
export async function videosById(ids: string[], oauth = false): Promise<Video[]> {
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await call<{ items: any[] }>('videos', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, { oauth, ttlH: oauth ? 0 : 6 });
    out.push(...j.items.map(toVideo));
  }
  return out;
}

export async function channelsById(ids: string[]): Promise<Channel[]> {
  const uniq = [...new Set(ids)].filter(Boolean);
  const out: Channel[] = [];
  for (let i = 0; i < uniq.length; i += 50) {
    const j = await call<{ items: any[] }>('channels', { part: 'snippet,statistics,contentDetails', id: uniq.slice(i, i + 50).join(','), maxResults: 50 });
    out.push(...(j.items ?? []).map(toChannel));
  }
  return out;
}

export async function resolveChannel(input: string): Promise<Channel> {
  const ref = parseChannelRef(input);
  if (!ref) throw new YtError('Enter a channel @handle, URL or ID.');
  const j = await call<{ items?: any[] }>('channels', { part: 'snippet,statistics,contentDetails', id: ref.id, forHandle: ref.handle }, { ttlH: 1 });
  if (!j.items?.length) throw new YtError(`No channel found for ${input}`);
  return toChannel(j.items[0]);
}

export async function myChannel(): Promise<Channel> {
  const j = await call<{ items?: any[] }>('channels', { part: 'snippet,statistics,contentDetails', mine: 'true' }, { oauth: true, ttlH: 0 });
  if (!j.items?.length) throw new YtError('This Google account has no YouTube channel.');
  return toChannel(j.items[0]);
}

/** Latest uploads of a channel (cheap: playlistItems = 1 unit instead of search = 100). */
export async function latestUploads(ch: Channel, max = 50, oauth = false): Promise<Video[]> {
  if (!ch.uploads) return [];
  const j = await call<{ items: any[] }>('playlistItems', { part: 'contentDetails', playlistId: ch.uploads, maxResults: Math.min(50, max) }, { oauth, ttlH: oauth ? 0 : 6 });
  return videosById(j.items.map((x) => x.contentDetails.videoId), oauth);
}

export interface SearchOpts {
  order?: 'relevance' | 'viewCount' | 'date';
  publishedAfter?: string;
  regionCode?: string;
  relevanceLanguage?: string;
  videoDuration?: 'any' | 'short' | 'medium' | 'long';
  max?: number;
}

/** search.list costs 100 units — results are cached for 12 h. */
export async function searchVideos(q: string, o: SearchOpts = {}): Promise<Video[]> {
  const j = await call<{ items: any[] }>('search', {
    part: 'snippet', type: 'video', q, order: o.order ?? 'relevance', publishedAfter: o.publishedAfter, regionCode: o.regionCode, relevanceLanguage: o.relevanceLanguage,
    videoDuration: o.videoDuration && o.videoDuration !== 'any' ? o.videoDuration : undefined, maxResults: o.max ?? 25,
  }, { ttlH: 12 });
  return videosById(j.items.map((x) => x.id.videoId).filter(Boolean));
}

export async function updateVideoSnippet(v: Video, changes: { title: string; description: string; tags: string[] }) {
  const headers = { ...(await authHeaders(true)), 'Content-Type': 'application/json' };
  const r = await fetch(`${DATA()}/videos?part=snippet`, {
    method: 'PUT', headers,
    body: JSON.stringify({ id: v.id, snippet: { title: changes.title, description: changes.description, tags: changes.tags, categoryId: v.categoryId } }),
  });
  useYt.getState().spend(QUOTA_COST['videos.update']);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new YtError(j.error?.message ?? `Update failed (${r.status})`);
  return toVideo(j);
}

/** YouTube Analytics report for the signed-in channel. */
export async function analytics(params: { metrics: string; startDate: string; endDate: string; dimensions?: string; sort?: string; maxResults?: number; filters?: string }) {
  return call<{ columnHeaders: { name: string }[]; rows?: (string | number)[][] }>('reports', { ids: 'channel==MINE', ...params }, { oauth: true, ttlH: 0, analytics: true });
}

/** YouTube search suggestions (free, no quota). Desktop app: via the main process; browser: JSONP. */
export async function suggestions(q: string, lang = ''): Promise<string[]> {
  if (!q.trim()) return [];
  const cached = cacheGet<string[]>(`suggest:${lang}:${q}`, 24);
  if (cached) return cached;
  let list: string[] = [];
  if (window.autostudio?.suggest) list = await window.autostudio.suggest(q, lang);
  else {
    list = await new Promise<string[]>((resolve) => {
      const cb = `__yts${Math.random().toString(36).slice(2)}`;
      const s = document.createElement('script');
      const done = (v: string[]) => (delete (window as any)[cb], s.remove(), resolve(v));
      (window as any)[cb] = (data: [string, [string, ...unknown[]][] | string[]]) => done((data[1] ?? []).map((x) => (Array.isArray(x) ? String(x[0]) : String(x))));
      s.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&hl=${encodeURIComponent(lang || 'en')}&q=${encodeURIComponent(q)}&callback=${cb}`;
      s.onerror = () => done([]);
      setTimeout(() => (window as any)[cb] && done([]), 8000);
      document.head.appendChild(s);
    });
  }
  cacheSet(`suggest:${lang}:${q}`, list);
  return list;
}

// ---------- scoring (pure) ----------
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp100 = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
export const ageDays = (iso: string, now = Date.now()) => Math.max(1, (now - new Date(iso).getTime()) / 86400_000);

export interface KeywordScore {
  /** 0–100: how many views the top results get per day. */
  demand: number;
  /** 0–100: how big the channels ranking for it are. */
  competition: number;
  /** 0–100 overall (high demand, low competition). */
  score: number;
  label: 'Great' | 'Good' | 'Fair' | 'Hard';
  medianViews: number;
  medianViewsPerDay: number;
  medianSubs: number;
  recentShare: number;
  smallChannelWins: number;
}

/** Estimate keyword opportunity from the top results and their channels' sizes. */
export function scoreKeyword(videos: Video[], subsOf: (channelId: string) => number, now = Date.now()): KeywordScore {
  const top = videos.slice(0, 15);
  const vpd = top.map((v) => v.views / ageDays(v.publishedAt, now));
  const subs = top.map((v) => subsOf(v.channelId));
  const mVpd = median(vpd), mSubs = median(subs);
  const demand = clamp100((Math.log10(mVpd + 1) / Math.log10(5000)) * 100);
  const competition = clamp100((Math.log10(mSubs + 1) / Math.log10(5_000_000)) * 100);
  const smallChannelWins = top.filter((v) => subsOf(v.channelId) < 100_000 && v.views > 50_000).length;
  const recentShare = top.filter((v) => ageDays(v.publishedAt, now) < 180).length / Math.max(1, top.length);
  const score = clamp100(0.55 * demand + 0.35 * (100 - competition) + smallChannelWins * 2 + recentShare * 5);
  const label = score >= 70 ? 'Great' : score >= 50 ? 'Good' : score >= 30 ? 'Fair' : 'Hard';
  return { demand, competition, score, label, medianViews: median(top.map((v) => v.views)), medianViewsPerDay: Math.round(mVpd), medianSubs: mSubs, recentShare, smallChannelWins };
}

/** Views relative to channel size — "this video did ×N better than the channel's reach". */
export const outlierScore = (views: number, subs: number) => +(views / Math.max(subs, 500)).toFixed(1);

/** Upload rhythm and recent performance from a channel's latest uploads. */
export function channelPulse(uploads: Video[], now = Date.now()) {
  const last28 = uploads.filter((v) => ageDays(v.publishedAt, now) <= 28);
  const last10 = uploads.slice(0, 10);
  return {
    perWeek: +(last28.length / 4).toFixed(1),
    avgViewsLast10: Math.round(last10.reduce((a, v) => a + v.views, 0) / Math.max(1, last10.length)),
    medianViewsLast10: Math.round(median(last10.map((v) => v.views))),
    shortsShare: uploads.length ? uploads.filter((v) => v.duration > 0 && v.duration <= 180).length / uploads.length : 0,
    top: [...uploads].sort((a, b) => b.views - a.views).slice(0, 5),
  };
}

// ---------- SEO (pure) ----------
export interface SeoCheck {
  ok: boolean;
  label: string;
  tip: string;
}

/** vidIQ-style SEO checklist for a video's metadata. `keyword` = the phrase it should rank for (optional). */
export function seoChecks(v: Pick<Video, 'title' | 'description' | 'tags'>, keyword = ''): { score: number; checks: SeoCheck[] } {
  const k = keyword.trim().toLowerCase();
  const title = v.title.trim(), desc = v.description.trim(), tagsLen = v.tags.join(',').length;
  const hashtags = desc.match(/#[\p{L}\d_]+/gu) ?? [];
  const checks: SeoCheck[] = [
    { ok: title.length >= 30 && title.length <= 70, label: `Title length ${title.length} (30–70)`, tip: 'Long enough to be descriptive, short enough not to be cut off.' },
    { ok: !k || title.toLowerCase().includes(k), label: k ? `Keyword "${keyword}" in title` : 'Keyword in title (set one)', tip: 'Put the main search phrase early in the title.' },
    { ok: !k || desc.slice(0, 200).toLowerCase().includes(k), label: 'Keyword in the first 200 characters of the description', tip: 'The first lines show in search and matter most.' },
    { ok: desc.length >= 250, label: `Description length ${desc.length} (≥ 250)`, tip: 'A real summary helps YouTube understand the video.' },
    { ok: /(^|\n)\s*0?0:00\b/.test(desc), label: 'Chapters (timestamps starting at 0:00)', tip: 'Chapters can appear in search results and improve retention.' },
    { ok: hashtags.length >= 1 && hashtags.length <= 15, label: `Hashtags ${hashtags.length} (1–15)`, tip: 'A few relevant hashtags; more than 15 and YouTube ignores them all.' },
    { ok: v.tags.length >= 5 && tagsLen <= 500, label: `Tags ${v.tags.length} (5+, ≤ 500 characters)`, tip: 'Mix broad and long-tail tags, including common misspellings.' },
    { ok: !k || v.tags.some((t) => t.toLowerCase().includes(k)), label: 'Keyword among the tags', tip: 'Add the exact keyword as a tag.' },
  ];
  return { score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100), checks };
}

/** Cheap key check (1 unit). */
export async function testKey(): Promise<string> {
  const j = await call<{ items: any[] }>('videos', { part: 'snippet', chart: 'mostPopular', maxResults: 1, regionCode: 'US' }, { ttlH: 0 });
  return j.items?.[0]?.snippet?.title ?? 'OK';
}

/** Scopes asked at sign-in: read channel + analytics, and edit video metadata (optimizer). */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];
export const googleAvailable = () => !!window.autostudio?.google;
