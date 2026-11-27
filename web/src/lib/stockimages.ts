/**
 * Free stock images with no key and no watermark: Openverse (CC0 / public domain mark), Wikimedia Commons (public
 * domain / CC0 via structured data), NASA Image Library, The Met (open access, checked per object) and the Art
 * Institute of Chicago (public domain). All allow requests from the app. Results are ranked with on-device CLIP
 * against the phrase, because keyword search alone rarely matched the script (why v3.0 removed free media).
 */
import { probe } from './project';
import { keywordsFrom } from './stocklinks';
import type { Asset } from '../types';

export type StockSource = 'Openverse' | 'Wikimedia' | 'NASA' | 'The Met' | 'Art Institute';
export interface StockHit {
  key: string;
  source: StockSource;
  title: string;
  thumb: string;
  full: string;
  page: string;
  creator?: string;
  licence: 'CC0' | 'Public domain';
  /** CLIP match 0..100 after ranking. */
  match?: number;
}

/** Tests point every source at a local fake server (scripts/fake-stock.mjs). */
const base = (real: string) => globalThis.localStorage?.getItem('stockBase') || real;
const enc = encodeURIComponent;

export const stockUrls = {
  openverse: (q: string) => `${base('https://api.openverse.org')}/v1/images/?q=${enc(q)}&license=cc0,pdm&page_size=12`,
  commons: (q: string) => `${base('https://commons.wikimedia.org')}/w/api.php?action=query&generator=search&gsrsearch=${enc(`${q} filetype:bitmap haswbstatement:P6216=Q19652|P275=Q6938433`)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=License|Artist|ObjectName&iiurlwidth=480&format=json&origin=*`,
  nasa: (q: string) => `${base('https://images-api.nasa.gov')}/search?q=${enc(q)}&media_type=image&page_size=12`,
  metSearch: (q: string) => `${base('https://collectionapi.metmuseum.org')}/public/collection/v1.1/search?q=${enc(q)}&hasImages=true&isPublicDomain=true&limit=12`,
  metObject: (id: number) => `${base('https://collectionapi.metmuseum.org')}/public/collection/v1/objects/${id}`,
  aic: (q: string) => `${base('https://api.artic.edu')}/api/v1/artworks/search?q=${enc(q)}&query[term][is_public_domain]=true&fields=id,title,image_id,artist_title&limit=12`,
};

const strip = (h = '') => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
type J = Record<string, any>;

export function parseOpenverse(j: J): StockHit[] {
  return (j.results ?? []).filter((r: J) => ['cc0', 'pdm'].includes(r.license) && r.url).map((r: J) => ({
    key: `ov:${r.id}`, source: 'Openverse', title: r.title || 'Untitled', thumb: r.thumbnail || r.url, full: r.url, page: r.foreign_landing_url || r.url,
    creator: r.creator, licence: r.license === 'cc0' ? 'CC0' : 'Public domain',
  }));
}

export function parseCommons(j: J): StockHit[] {
  return Object.values(j.query?.pages ?? {}).flatMap((p: any) => {
    const ii = p.imageinfo?.[0], lic = String(ii?.extmetadata?.License?.value ?? '').toLowerCase();
    if (!ii?.thumburl || !/^(cc0|pd)/.test(lic)) return [];
    return [{
      key: `wm:${p.pageid}`, source: 'Wikimedia' as const, title: strip(ii.extmetadata?.ObjectName?.value) || String(p.title).replace(/^File:|\.[a-z]+$/gi, ''),
      thumb: ii.thumburl, full: String(ii.thumburl).replace(/\/\d+px-/, '/1920px-'), page: ii.descriptionurl ?? ii.url, creator: strip(ii.extmetadata?.Artist?.value),
      licence: lic.startsWith('cc0') ? 'CC0' as const : 'Public domain' as const,
    }];
  });
}

export function parseNasa(j: J): StockHit[] {
  return (j.collection?.items ?? []).flatMap((it: J) => {
    const d = it.data?.[0], href = it.links?.find((l: J) => l.render === 'image' || /\.(jpe?g|png)$/i.test(l.href))?.href;
    if (!d?.nasa_id || !href) return [];
    return [{ key: `nasa:${d.nasa_id}`, source: 'NASA' as const, title: d.title ?? d.nasa_id, thumb: href, full: String(href).replace(/~(thumb|small|medium)\./, '~large.'), page: `https://images.nasa.gov/details/${d.nasa_id}`, creator: d.secondary_creator ?? d.center, licence: 'Public domain' as const }];
  });
}

export function parseMetObject(o: J): StockHit[] {
  if (!o?.isPublicDomain || !o.primaryImageSmall) return [];
  return [{ key: `met:${o.objectID}`, source: 'The Met', title: o.title || 'Untitled', thumb: o.primaryImageSmall, full: o.primaryImage || o.primaryImageSmall, page: o.objectURL, creator: o.artistDisplayName, licence: 'CC0' }];
}

export function parseAic(j: J): StockHit[] {
  const iiif = j.config?.iiif_url ?? 'https://www.artic.edu/iiif/2';
  return (j.data ?? []).filter((d: J) => d.image_id).map((d: J) => ({
    key: `aic:${d.id}`, source: 'Art Institute', title: d.title ?? 'Untitled', thumb: `${iiif}/${d.image_id}/full/400,/0/default.jpg`, full: `${iiif}/${d.image_id}/full/1686,/0/default.jpg`,
    page: `https://www.artic.edu/artworks/${d.id}`, creator: d.artist_title, licence: 'Public domain',
  }));
}

const getJson = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

const cache = new Map<string, Promise<{ hits: StockHit[]; errors: string[] }>>();
/** Search every source (a failing or rate-limited source is skipped and reported). */
export function searchStock(q: string): Promise<{ hits: StockHit[]; errors: string[] }> {
  const key = q.trim().toLowerCase();
  if (!key) return Promise.resolve({ hits: [], errors: [] });
  if (!cache.has(key)) {
    const jobs: [StockSource, () => Promise<StockHit[]>][] = [
      ['Openverse', async () => parseOpenverse(await getJson(stockUrls.openverse(q)))],
      ['Wikimedia', async () => parseCommons(await getJson(stockUrls.commons(q)))],
      ['NASA', async () => parseNasa(await getJson(stockUrls.nasa(q))).slice(0, 6)],
      ['The Met', async () => {
        const ids: number[] = ((await getJson(stockUrls.metSearch(q))).objectIDs ?? []).slice(0, 6);
        return (await Promise.allSettled(ids.map(async (id) => parseMetObject(await getJson(stockUrls.metObject(id)))))).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      }],
      ['Art Institute', async () => parseAic(await getJson(stockUrls.aic(q))).slice(0, 6)],
    ];
    cache.set(key, Promise.allSettled(jobs.map(([, f]) => f())).then((res) => ({
      hits: res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
      errors: res.flatMap((r, i) => (r.status === 'rejected' ? [`${jobs[i][0]}: ${(r.reason as Error)?.message ?? 'failed'}`] : [])),
    })));
    cache.get(key)!.catch(() => cache.delete(key));
  }
  return cache.get(key)!;
}

/** Search words for a phrase, plus a simpler retry (fewer words) when the first search finds little. */
export const stockQueries = (text: string) => [...new Set([keywordsFrom(text, 3), keywordsFrom(text, 1)].filter(Boolean))];

/** Order hits by CLIP similarity to the phrase (thumbnails that can't be fetched go last). `embed` is injectable for tests. */
export async function rankStock(hits: StockHit[], phrase: string, embed: { text: (t: string) => Promise<Float32Array>; images: (b: Blob[]) => Promise<Float32Array[]> }): Promise<StockHit[]> {
  if (!hits.length) return [];
  const tv = await embed.text(phrase);
  const blobs = await Promise.all(hits.map((h) => fetch(h.thumb).then((r) => (r.ok ? r.blob() : null)).catch(() => null)));
  const ok = hits.map((_, i) => i).filter((i) => blobs[i]);
  const vecs = ok.length ? await embed.images(ok.map((i) => blobs[i]!)) : [];
  const score = new Map<number, number>();
  ok.forEach((i, k) => score.set(i, vecs[k].reduce((s, v, j) => s + v * tv[j], 0)));
  const pct = (s: number) => Math.round(Math.max(0, Math.min(1, (s - 0.15) / 0.17)) * 100);
  return hits.map((h, i) => ({ ...h, match: score.has(i) ? pct(score.get(i)!) : 0 })).sort((a, b) => (b.match ?? 0) - (a.match ?? 0));
}

/** Download a hit into a new Media asset (licence and source kept). Falls back to the thumbnail, then the desktop bridge. */
export async function downloadStock(hit: StockHit): Promise<Asset> {
  let blob: Blob | null = null;
  for (const url of [hit.full, hit.thumb]) {
    blob = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    if (!blob && window.autostudio?.fetchMedia) blob = await window.autostudio.fetchMedia(url).then((m) => new Blob([m.data], { type: m.type })).catch(() => null);
    if (blob && blob.type.startsWith('image/')) break;
    blob = null;
  }
  if (!blob) throw new Error(`Could not download “${hit.title}”`);
  const ext = blob.type.includes('png') ? 'png' : 'jpg';
  const a = await probe(blob, `${hit.title.slice(0, 60)} (${hit.source}, ${hit.licence}).${ext}`, 'image');
  return { ...a, source: hit.page, licence: hit.licence };
}
