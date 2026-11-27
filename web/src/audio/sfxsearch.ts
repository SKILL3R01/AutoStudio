import { PACK } from './pack';
import { normWord, SFX_RULES } from './scriptsfx';
import { probe } from '../lib/project';
import type { Asset, Project } from '../types';

/**
 * Sound search for the sound picker: the bundled recordings, the user's Media files and — in the desktop app — the
 * CC0 libraries BigSoundBank and Freesound (pages fetched by the main process; only CC0 sounds are used, checked on
 * the sound's own page before download).
 */
export type SoundHit =
  | { kind: 'pack'; key: string; title: string; duration: number; credit: string; sound: string }
  | { kind: 'media'; key: string; title: string; duration?: number; assetId: string }
  | { kind: 'online'; key: string; title: string; duration?: number; credit: string; site: 'BigSoundBank' | 'Freesound'; page: string; mp3: string; detail?: string };

/** The choice made in the picker: a built-in recording (`rec:<id>`) or a Media file. */
export type SoundPick = { sound: string; title: string; duration: number } | { assetId: string; title: string; duration: number };

const terms = (q: string) => q.split(/\s+/).map(normWord).filter((w) => w.length > 1);
/** Query words found in the text: 2 for a word that starts with the term ("buzz" → "buzzer"), 1 for a shorter part ("doorbell" → "door"). */
const score = (q: string[], text: string) => {
  const ws = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return q.reduce((s, t) => s + (ws.some((w) => w.startsWith(t)) ? 2 : ws.some((w) => w.length > 3 && t.startsWith(w)) ? 1 : 0), 0);
};
const rank = <T>(items: [T, number][]) => items.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x);

export function searchPack(q: string): SoundHit[] {
  const t = terms(q);
  return rank(PACK.map((s) => {
    const r = SFX_RULES.find((x) => x.id === s.rule);
    const text = `${s.title} ${r?.label ?? ''} ${r?.files.join(' ') ?? ''} ${s.rule}`;
    return [{ kind: 'pack', key: `rec:${s.id}`, title: s.title, duration: s.duration, credit: `${r?.label ?? s.rule} · ${s.author}`, sound: `rec:${s.id}` } as SoundHit, t.length ? score(t, text) : 1];
  }));
}

export function searchMedia(p: Project, q: string): SoundHit[] {
  const t = terms(q);
  return rank(p.assets.filter((a) => a.kind === 'audio' && !a.name.startsWith('__')).map((a) => [{ kind: 'media', key: a.id, title: a.name, duration: a.duration, assetId: a.id } as SoundHit, t.length ? score(t, a.name) : 1]));
}

const clock = (s: string) => s.split(':').reduce((t, x) => t * 60 + Number(x), 0);
/** Tags stripped and common entities decoded (works in tests without a DOM). */
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/** Results of a BigSoundBank search page. */
export function parseBigSoundBank(html: string): SoundHit[] {
  const out: SoundHit[] = [];
  const re = /<h2[^>]*><a href='\/([^']+-s(\d+)\.html)'>(.*?)<\/a>[\s\S]*?<div>([\s\S]*?)<a href='\/categories\.html'>UCS Category<\/a>[\s\S]*?Length: ([0-9:]+)/g;
  for (const m of html.matchAll(re)) {
    out.push({
      kind: 'online', key: `bsb:${m[2]}`, title: text(m[3]).replace(/\s*#/, ' #'), duration: clock(m[5]), credit: 'Joseph SARDIN · CC0', site: 'BigSoundBank',
      page: `https://bigsoundbank.com/${m[1]}`, mp3: `https://bigsoundbank.com/UPLOAD/mp3/${m[2]}.mp3`, detail: text(m[4]).slice(0, 120),
    });
  }
  return out;
}

/** Results of a Freesound search page (the search URL is already filtered to CC0). */
export function parseFreesoundSearch(html: string): SoundHit[] {
  const out: SoundHit[] = [];
  for (const m of html.matchAll(/class="bw-player"([^>]*)>/g)) {
    const a = (k: string) => m[1].match(new RegExp(`data-${k}="([^"]*)"`))?.[1];
    const id = a('sound-id'), user = a('username'), mp3 = a('mp3');
    if (!id || !user || !mp3) continue;
    out.push({
      kind: 'online', key: `fs:${id}`, title: text(a('title') ?? id).replace(/\.(wav|mp3|flac|ogg|aiff?)$/i, ''), duration: Number(a('duration')) || undefined,
      credit: `${user} · CC0`, site: 'Freesound', page: `https://freesound.org/people/${user}/sounds/${id}/`, mp3: mp3.replace(/-lq\.mp3$/, '-hq.mp3'),
    });
  }
  return out;
}

/** True when the sound's own page shows the CC0 licence. */
export function isCc0Page(site: 'BigSoundBank' | 'Freesound', html: string) {
  return site === 'BigSoundBank' ? /CC0 \(public domain\): Free and royalty-free/.test(html) : html.includes('creativecommons.org/publicdomain/zero/1.0');
}

export const onlineSearchAvailable = () => typeof window !== 'undefined' && !!window.autostudio?.fetchText;

/** Search both CC0 libraries (desktop app only). Errors of one site don't hide the other's results. */
export async function searchOnline(q: string): Promise<{ hits: SoundHit[]; errors: string[] }> {
  const fetchText = window.autostudio?.fetchText;
  if (!fetchText || !q.trim()) return { hits: [], errors: [] };
  const enc = encodeURIComponent(q.trim());
  const sites: [string, string, (h: string) => SoundHit[]][] = [
    ['BigSoundBank', `https://bigsoundbank.com/search?q=${enc}`, parseBigSoundBank],
    ['Freesound', `https://freesound.org/search/?q=${enc}&f=${encodeURIComponent('license:"Creative Commons 0"')}`, parseFreesoundSearch],
  ];
  const res = await Promise.allSettled(sites.map(async ([, url, parse]) => parse(await fetchText(url)).slice(0, 12)));
  return {
    hits: res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    errors: res.flatMap((r, i) => (r.status === 'rejected' ? [`${sites[i][0]}: ${(r.reason as Error).message}`] : [])),
  };
}

/** Download an online result (after checking its page is CC0) and return it as a new Media asset. */
export async function downloadOnline(hit: Extract<SoundHit, { kind: 'online' }>): Promise<Asset> {
  const bridge = window.autostudio;
  if (!bridge?.fetchText || !bridge.fetchMedia) throw new Error('Online sounds need the desktop app');
  if (!isCc0Page(hit.site, await bridge.fetchText(hit.page))) throw new Error('This sound is not CC0 — not downloaded');
  const { type, data } = await bridge.fetchMedia(hit.mp3);
  const asset = await probe(new Blob([data], { type: type || 'audio/mpeg' }), `${hit.title} (${hit.site}, CC0).mp3`, 'audio');
  return { ...asset, source: hit.page, licence: 'CC0 1.0' };
}

/** A playable URL for previewing an online result (downloaded through the desktop bridge). */
export async function onlinePreviewUrl(hit: Extract<SoundHit, { kind: 'online' }>): Promise<string> {
  const { type, data } = await window.autostudio!.fetchMedia!(hit.mp3);
  return URL.createObjectURL(new Blob([data], { type: type || 'audio/mpeg' }));
}

/**
 * Swap the sound of an audio clip for a picked one: keeps its start, volume and fades; the length becomes the new
 * sound's length (at most 10 s, and never past the next clip on the same track).
 */
export function replaceAudioSound(p: Project, clipId: string, pick: SoundPick) {
  const c = p.audio.find((x) => x.id === clipId);
  if (!c) return;
  const next = p.audio.filter((x) => x.trackId === c.trackId && x.id !== c.id && x.start > c.start).reduce((m, x) => Math.min(m, x.start), Infinity);
  Object.assign(c, 'sound' in pick ? { sound: pick.sound, assetId: '' } : { assetId: pick.assetId, sound: undefined }, {
    trimIn: 0, rate: undefined, curve: undefined, takes: undefined, activeTake: undefined,
    duration: Math.max(0.2, Math.min(pick.duration || c.duration, 10, next - c.start - 0.05)),
  });
  c.fadeOut = Math.min(c.fadeOut ?? 0, c.duration / 2);
}
