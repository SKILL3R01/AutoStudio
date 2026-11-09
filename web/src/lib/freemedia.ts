/**
 * Free media without API keys:
 *  - Wikimedia Commons (images, video, audio) — public domain / CC0 by default, CC BY / BY-SA optional (credit required).
 *  - Openverse (images, audio) — CC0 / Public Domain Mark by default; anonymous use is rate-limited (≈20/min, 200/day).
 * Pexels and Pixabay have no keyless API, so they are offered as "search on the website" links.
 */
export type FreeKind = 'image' | 'video' | 'music' | 'sfx';
export type FreeSource = 'wikimedia' | 'openverse' | 'nasa' | 'usgs' | 'all';

export interface FreeItem {
  id: string;
  source: FreeSource;
  kind: 'image' | 'video' | 'audio';
  title: string;
  creator: string;
  license: string;
  /** True when the licence requires a credit line (CC BY / BY-SA). */
  credit: boolean;
  thumb: string;
  url: string;
  page: string;
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
}

export interface Credit {
  assetId: string;
  title: string;
  creator: string;
  license: string;
  page: string;
  required: boolean;
}

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
/** Licences that never need a credit line. */
export const isNoCredit = (license: string) => /public domain|^pd\b|pdm|cc0|cc-zero|no restrictions/i.test(license);
const ACCEPTED = /public domain|pdm|cc0|cc-zero|^cc[- ]by(?:[- ]sa)?[- ]?\d|^cc by|attribution/i;

// ---------- Wikimedia Commons ----------
const FILETYPE: Record<FreeKind, string> = { image: 'bitmap', video: 'video', music: 'audio', sfx: 'audio' };
const MAX_VIDEO_BYTES = 120e6;

/** Pick a browser-friendly video file: a ≤1080p WebM/VP9 transcode, else the original if it is small. */
export function pickVideoUrl(original: { url: string; size: number; mime: string }, derivatives: { src: string; type: string; height?: number }[]): string | null {
  const webm = derivatives.filter((d) => /webm/.test(d.type) && (d.height ?? 0) <= 1080).sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (webm[0]) return webm[0].src;
  if (/webm|mp4/.test(original.mime) && original.size < MAX_VIDEO_BYTES) return original.url;
  return null;
}

export async function searchWikimedia(q: string, kind: FreeKind, allowCredit: boolean): Promise<FreeItem[]> {
  const prop = kind === 'image' ? 'imageinfo' : 'videoinfo';
  const pre = kind === 'image' ? 'ii' : 'vi';
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '40',
    gsrsearch: `filetype:${FILETYPE[kind]} ${q}`, prop,
    [`${pre}prop`]: `url|mime|size|extmetadata${kind === 'image' ? '' : '|derivatives'}`, [`${pre}urlwidth`]: '500',
    [`${pre}extmetadatafilter`]: 'LicenseShortName|Artist|AttributionRequired|ObjectName',
  });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  const pages = Object.values(j.query?.pages ?? {}) as any[];
  const out: FreeItem[] = [];
  for (const pg of pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const info = pg[prop]?.[0];
    if (!info) continue;
    const m = info.extmetadata ?? {};
    const license = stripHtml(m.LicenseShortName?.value) || 'unknown';
    const credit = !isNoCredit(license) && m.AttributionRequired?.value !== 'false';
    if (!ACCEPTED.test(license) || (credit && !allowCredit)) continue;
    let url = info.url as string;
    if (kind === 'video') {
      const v = pickVideoUrl({ url: info.url, size: info.size, mime: info.mime }, info.derivatives ?? []);
      if (!v) continue;
      url = v;
    } else if (kind === 'image') {
      if (!/jpeg|png|webp/.test(info.mime)) continue;
      // Very large originals: use a 1920 px rendition instead.
      if (info.size > 12e6 && info.thumburl) url = String(info.thumburl).replace(/\/\d+px-/, '/1920px-');
    } else if (!/ogg|mpeg|wav|flac|opus|webm/.test(info.mime)) continue;
    out.push({
      id: `wm:${pg.pageid}`, source: 'wikimedia', kind: kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio',
      title: stripHtml(m.ObjectName?.value) || String(pg.title).replace(/^File:/, '').replace(/\.[^.]+$/, ''),
      creator: stripHtml(m.Artist?.value) || 'unknown', license, credit, thumb: info.thumburl ?? '', url, page: info.descriptionurl,
      width: info.width, height: info.height, duration: info.duration, size: info.size,
    });
  }
  return out;
}

// ---------- Openverse ----------
export async function searchOpenverse(q: string, kind: FreeKind, allowCredit: boolean, aspect?: 'wide' | 'tall' | 'square'): Promise<FreeItem[]> {
  if (kind === 'video') return [];
  const type = kind === 'image' ? 'images' : 'audio';
  const params = new URLSearchParams({ q, page_size: '30', license: allowCredit ? 'cc0,pdm,by,by-sa' : 'cc0,pdm' });
  if (kind === 'image' && aspect) params.set('aspect_ratio', aspect);
  if (kind === 'music') params.set('category', 'music');
  if (kind === 'sfx') params.set('category', 'sound_effect');
  let r: Response;
  try {
    r = await fetch(`https://api.openverse.org/v1/${type}/?${params}`, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('Openverse is not answering right now — try Wikimedia Commons.');
  }
  if (r.status === 429) throw new Error('Openverse limit reached (about 20 searches a minute / 200 a day without a key) — try again later or use Wikimedia.');
  const j = await r.json();
  return (j.results ?? []).map((x: any): FreeItem => {
    const license = `${String(x.license).toUpperCase()}${x.license_version ? ` ${x.license_version}` : ''}`;
    return {
      id: `ov:${x.id}`, source: 'openverse', kind: kind === 'image' ? 'image' : 'audio', title: x.title || 'Untitled', creator: x.creator || 'unknown',
      license, credit: !isNoCredit(x.license), thumb: x.thumbnail ?? '', url: x.url, page: x.foreign_landing_url ?? x.detail_url,
      width: x.width, height: x.height, duration: x.duration ? x.duration / 1000 : undefined, size: x.filesize ?? undefined,
    };
  });
}

/** Websites without a keyless API — open them already searched. */
export const siteLinks = (q: string, kind: FreeKind) => {
  const s = encodeURIComponent(q.trim());
  const slug = q.trim().toLowerCase().replace(/\s+/g, '-');
  return [
    { label: 'Pexels', url: kind === 'video' ? `https://www.pexels.com/search/videos/${s}/` : `https://www.pexels.com/search/${s}/` },
    { label: 'Pixabay', url: kind === 'video' ? `https://pixabay.com/videos/search/${slug}/` : kind === 'music' ? `https://pixabay.com/music/search/${slug}/` : kind === 'sfx' ? `https://pixabay.com/sound-effects/search/${slug}/` : `https://pixabay.com/images/search/${slug}/` },
  ];
};

/** Download a result. The desktop app can fetch hosts that block cross-site downloads; the browser falls back to the thumbnail. */
export async function downloadFree(item: FreeItem): Promise<Blob> {
  if (item.url.startsWith('nasa-video:')) {
    // NASA videos: pick a medium / small MP4 from the asset list.
    const list: string[] = await (await fetch(item.url.slice('nasa-video:'.length), { signal: AbortSignal.timeout(20000) })).json();
    const pick = list.find((u) => /~medium\.mp4$/i.test(u)) ?? list.find((u) => /~small\.mp4$/i.test(u)) ?? list.find((u) => /\.mp4$/i.test(u));
    if (!pick) throw new Error('This NASA video has no MP4 file');
    item = { ...item, url: pick.replace(/^http:/, 'https:') };
  }
  try {
    const r = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
    if (r.ok) return await r.blob();
  } catch {
    /* CORS or network — try the desktop proxy */
  }
  if (window.autostudio?.fetchMedia) {
    const m = await window.autostudio.fetchMedia(item.url);
    return new Blob([m.data], { type: m.type });
  }
  if (item.kind === 'image' && item.thumb) return (await fetch(item.thumb)).blob();
  throw new Error('This file cannot be downloaded from the browser version — use the desktop app or the "Open page" link.');
}

/** Short search words from a narration line (drops filler words). */
export function keywordsFrom(text: string, max = 4): string {
  const stop = new Set('a an the and or but if then so of to in on at for with by from as is are was were be been being it its this that these those you your we our they their he she his her i me my not no do does did have has had will would can could should just very really what when where who why how all any some more most there here up down out about over into than too also only even ever every one'.split(' '));
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const seen = new Set<string>();
  return words.filter((w) => !seen.has(w) && seen.add(w)).slice(0, max).join(' ');
}

/** Credit lines for the video description. */
export const creditsText = (credits: Credit[]) =>
  credits.map((c) => `“${c.title}” by ${c.creator} — ${c.license} — ${c.page}`).join('\n');

// ---------- NASA (public domain, no key) ----------
export async function searchNasa(q: string, kind: FreeKind): Promise<FreeItem[]> {
  if (kind === 'music' || kind === 'sfx') return [];
  const r = await fetch(`https://images-api.nasa.gov/search?${new URLSearchParams({ q, media_type: kind, page_size: '30' })}`, { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  return (j.collection?.items ?? []).map((it: any): FreeItem => {
    const d = it.data?.[0] ?? {};
    const thumb = it.links?.[0]?.href ?? '';
    return {
      id: `nasa:${d.nasa_id}`, source: 'nasa', kind, title: d.title ?? d.nasa_id, creator: d.photographer || d.center || 'NASA',
      license: 'Public domain (NASA)', credit: false, thumb,
      // Images: the large rendition; videos: resolved from the asset list when downloading.
      url: kind === 'image' ? thumb.replace('~thumb', '~large') : `nasa-video:${it.href}`,
      page: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
    };
  });
}

/** USGS public-domain media mirrored on Wikimedia Commons. */
export const searchUsgs = (q: string, kind: FreeKind, allowCredit: boolean) => searchWikimedia(`USGS ${q}`, kind, allowCredit);

export interface MultiResult {
  items: FreeItem[];
  status: { source: string; count: number; error?: string }[];
  query: string;
}

/** Search several sources at once; if nothing comes back, retry with simpler words. */
export async function searchAll(q: string, kind: FreeKind, allowCredit: boolean, sources: FreeSource[] = ['wikimedia', 'openverse', 'nasa', 'usgs'], aspect?: 'wide' | 'tall' | 'square'): Promise<MultiResult> {
  const run = async (query: string): Promise<MultiResult> => {
    const jobs = sources.map((src) => (src === 'openverse' ? searchOpenverse(query, kind, allowCredit, aspect) : src === 'nasa' ? searchNasa(query, kind) : src === 'usgs' ? searchUsgs(query, kind, allowCredit) : searchWikimedia(query, kind, allowCredit)));
    const res = await Promise.allSettled(jobs);
    const seen = new Set<string>();
    const lists = res.map((r) => (r.status === 'fulfilled' ? r.value : []));
    // Interleave sources so the first results are varied.
    const items: FreeItem[] = [];
    for (let k = 0; k < Math.max(0, ...lists.map((l) => l.length)); k++) for (const l of lists) if (l[k] && !seen.has(l[k].url)) (seen.add(l[k].url), items.push(l[k]));
    return { items, query, status: res.map((r, i) => ({ source: sources[i], count: lists[i].length, error: r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason).slice(0, 80) : undefined })) };
  };
  let out = await run(q);
  if (!out.items.length) {
    const simpler = simplerQuery(q);
    if (simpler && simpler !== q) out = await run(simpler);
  }
  return out;
}

/** Fewer, stronger words for a retry ("a man walking on a beach at sunset" → "beach sunset"). */
export function simplerQuery(q: string): string {
  const k = keywordsFrom(q, 4).split(' ').filter(Boolean);
  return k.length > 2 ? k.slice(-2).join(' ') : k.slice(0, 1).join(' ');
}
