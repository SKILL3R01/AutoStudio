/** Growth helpers that need no API: niche RPM estimates, YouTube Partner Program targets, monetization readiness. */
import { narrationClips, narrationEnd } from './audiotracks';
import type { Project } from '../types';

export interface Niche {
  id: string;
  name: string;
  /** Typical creator RPM range in USD per 1,000 views (long-form, audience mostly in high-income countries). */
  rpm: [number, number];
  faceless: 'great' | 'good' | 'ok';
  seeds: string[];
}

/**
 * Rough, commonly reported RPM ranges. Real RPM varies a lot with audience country, season, video length,
 * ad suitability and Shorts vs long-form (Shorts pay far less). Always shown as an estimate.
 */
export const NICHES: Niche[] = [
  { id: 'finance', name: 'Personal finance & investing', rpm: [6, 15], faceless: 'great', seeds: ['how to invest', 'passive income', 'budgeting tips'] },
  { id: 'business', name: 'Business & making money online', rpm: [5, 12], faceless: 'great', seeds: ['side hustle ideas', 'business explained', 'how companies make money'] },
  { id: 'ai-tech', name: 'AI tools & software', rpm: [5, 12], faceless: 'great', seeds: ['ai tools', 'chatgpt tutorial', 'best ai apps'] },
  { id: 'tech', name: 'Tech & gadgets', rpm: [4, 9], faceless: 'good', seeds: ['tech explained', 'best gadgets', 'how it works'] },
  { id: 'real-estate', name: 'Real estate', rpm: [6, 14], faceless: 'good', seeds: ['real estate investing', 'housing market', 'first home tips'] },
  { id: 'education', name: 'Education & explainers', rpm: [3, 8], faceless: 'great', seeds: ['explained', 'how does', 'why do'] },
  { id: 'health', name: 'Health & fitness', rpm: [3, 7], faceless: 'good', seeds: ['healthy habits', 'workout at home', 'nutrition tips'] },
  { id: 'self-improvement', name: 'Self-improvement & motivation', rpm: [2, 6], faceless: 'great', seeds: ['discipline', 'stoicism', 'productivity tips'] },
  { id: 'psychology', name: 'Psychology & relationships', rpm: [2, 6], faceless: 'great', seeds: ['dark psychology', 'body language', 'human behavior'] },
  { id: 'history', name: 'History & documentaries', rpm: [2, 6], faceless: 'great', seeds: ['history explained', 'ancient civilizations', 'untold history'] },
  { id: 'science', name: 'Science & space', rpm: [2, 6], faceless: 'great', seeds: ['space facts', 'science explained', 'universe'] },
  { id: 'mystery', name: 'True crime & mysteries', rpm: [2, 5], faceless: 'great', seeds: ['unsolved mysteries', 'true crime story', 'creepy facts'] },
  { id: 'travel', name: 'Travel & places', rpm: [2, 5], faceless: 'good', seeds: ['places to visit', 'travel guide', 'abandoned places'] },
  { id: 'food', name: 'Food & cooking', rpm: [2, 5], faceless: 'ok', seeds: ['easy recipes', 'food facts', 'street food'] },
  { id: 'stories', name: 'Stories & entertainment', rpm: [1, 3], faceless: 'great', seeds: ['reddit stories', 'animated story', 'bedtime stories'] },
  { id: 'gaming', name: 'Gaming', rpm: [1, 3], faceless: 'good', seeds: ['game lore', 'gaming facts', 'game explained'] },
  { id: 'kids', name: 'Kids & animation', rpm: [0.5, 2], faceless: 'good', seeds: ['nursery rhymes', 'kids stories', 'learn colors'] },
  { id: 'music', name: 'Music & ambience', rpm: [0.5, 2], faceless: 'good', seeds: ['lofi music', 'relaxing music', 'sleep sounds'] },
];

/** Shorts revenue is pooled and much lower — a rough per-1,000-views range. */
export const SHORTS_RPM: [number, number] = [0.03, 0.1];

export const nicheById = (id?: string) => NICHES.find((n) => n.id === id);

/** Estimated monthly earnings range for a number of monthly views. */
export const earnings = (monthlyViews: number, rpm: [number, number]): [number, number] => [(monthlyViews / 1000) * rpm[0], (monthlyViews / 1000) * rpm[1]];

export const money = (x: number) => (x >= 1000 ? `$${(x / 1000).toFixed(x >= 10_000 ? 0 : 1)}k` : `$${Math.round(x)}`);
export const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(Math.round(n));

/** YouTube Partner Program targets (check YouTube's help page — they can change). */
export const YPP = {
  fanFunding: { subs: 500, uploads90d: 3, watchHours12m: 3000, shortsViews90d: 3_000_000 },
  ads: { subs: 1000, watchHours12m: 4000, shortsViews90d: 10_000_000 },
};

export type CheckStatus = 'ok' | 'warn' | 'info';
export interface ReadinessItem {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
}

/** A project's "style fingerprint" — identical fingerprints across many videos look mass-produced. */
export const fingerprint = (p: Project) =>
  [p.captions.style, [...new Set(p.typo.map((b) => b.template))].sort().join('+'), p.audio.filter((m) => m.trackId !== p.narrationTrackId).map((m) => p.assets.find((a) => a.id === m.assetId)?.name ?? m.sound ?? '').sort().join('+'), p.effects.map((e) => e.kind).sort().join('+'), [...new Set(p.clips.map((c) => c.motion))].sort().join('+')].join('|');

/**
 * Pre-upload checklist against YouTube's monetization policies for faceless / AI-assisted videos
 * ("inauthentic" mass-produced or repetitive content, reused content, rights, synthetic-content disclosure).
 */
export function readiness(p: Project, others: Project[] = []): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  const words = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const length = Math.max(p.length, words[words.length - 1]?.end ?? 0, narrationEnd(p));
  const minutes = length / 60;
  const vertical = p.export.aspect === '9:16';

  out.push(narrationClips(p).length
    ? { id: 'voice', status: 'ok', title: 'Narration', detail: 'The video has a voiceover — commentary is what makes faceless videos original.' }
    : { id: 'voice', status: 'warn', title: 'No narration', detail: 'Videos that are only images/clips + music are often judged as reused or low-effort. Add commentary or a story.' });

  out.push(words.length >= Math.max(30, minutes * 60)
    ? { id: 'script', status: 'ok', title: 'Script', detail: `${words.length} spoken words. Make sure it is your own writing (rewrite AI drafts in your own voice and add insight).` }
    : { id: 'script', status: words.length ? 'warn' : 'info', title: 'Script', detail: words.length ? 'Very few spoken words for the length — viewers (and reviewers) look for real information or story.' : 'No transcript yet — transcribe the voiceover to check this and to add captions.' });

  out.push(vertical && length <= 180
    ? { id: 'length', status: 'ok', title: 'Format', detail: `Short (${Math.round(length)} s, vertical).` }
    : length >= 60
      ? { id: 'length', status: 'ok', title: 'Format', detail: `Long-form (${minutes.toFixed(1)} min). 8+ minutes allows mid-roll ads.` }
      : { id: 'length', status: 'warn', title: 'Format', detail: `${Math.round(length)} s horizontal video — too short for long-form; make it longer or export 9:16 as a Short.` });

  const visualIds = p.clips.filter((c) => !c.fill).map((c) => c.assetId);
  const distinct = new Set(visualIds).size;
  const perMin = distinct / Math.max(0.5, minutes);
  out.push(perMin >= 3 || distinct >= 8
    ? { id: 'variety', status: 'ok', title: 'Visual variety', detail: `${distinct} different visuals (${perMin.toFixed(1)} per minute).` }
    : { id: 'variety', status: 'warn', title: 'Visual variety', detail: `Only ${distinct} different visuals (${perMin.toFixed(1)} per minute). Static or repeated images feel low-effort — aim for a new visual every 5–15 s.` });

  const clipsVideo = p.clips.filter((c) => p.assets.find((a) => a.id === c.assetId)?.kind === 'video');
  const aiVideo = clipsVideo.filter((c) => /_ai\b|_ai\./i.test(p.assets.find((a) => a.id === c.assetId)?.name ?? ''));
  const licensed = new Set((p.credits ?? []).map((c) => c.assetId));
  const unknown = clipsVideo.filter((c) => !aiVideo.includes(c) && !licensed.has(c.assetId));
  if (unknown.length) {
    out.push({ id: 'rights', status: 'warn', title: 'Video footage rights', detail: `${unknown.length} video clip(s) from files — only use footage you made, licensed, or that is clearly free to reuse. Movie/TV/other creators' clips cause Content ID claims.` });
  }
  const needCredit = (p.credits ?? []).filter((c) => c.required);
  if (needCredit.length) out.push({ id: 'credits', status: 'info', title: 'Credits to add', detail: `${needCredit.length} free item(s) are CC BY / BY-SA — paste their credit lines into the description (from the original source pages).` });
  if (p.audio.some((m) => m.assetId && p.audioTracks.find((t) => t.id === m.trackId)?.kind === 'music')) out.push({ id: 'music', status: 'warn', title: 'Music licence', detail: 'Use music you have rights to (YouTube Audio Library, or royalty-free with a licence). Popular songs get claimed and lose revenue.' });

  out.push({ id: 'ai', status: 'info', title: 'AI disclosure', detail: `${aiVideo.length ? `${aiVideo.length} AI-generated clip(s). ` : ''}If AI imagery or voice could be mistaken for real people, places or events, turn on "Altered or synthetic content" when uploading. Fantasy, animation and clearly-illustrative visuals don't need it.` });

  const fp = fingerprint(p);
  const same = others.filter((o) => o.id !== p.id && fingerprint(o) === fp).length;
  out.push(same >= 2
    ? { id: 'template', status: 'warn', title: 'Same template as other videos', detail: `${same} other projects use exactly the same caption style, typography, music and effects. Channels where every video looks identical risk the "inauthentic / mass-produced content" policy — vary the look per video.` }
    : { id: 'template', status: 'ok', title: 'Varied style', detail: others.length ? 'This project does not copy the exact style of your other projects.' : 'Open more projects to compare styles.' });

  out.push(/untitled|demo project/i.test(p.name)
    ? { id: 'title', status: 'warn', title: 'Title', detail: 'Give the project its real video title (also used by Prompt Studio and the SEO tools).' }
    : { id: 'title', status: 'ok', title: 'Title', detail: `"${p.name}"` });
  out.push(p.captions.enabled || p.typo.length
    ? { id: 'captions', status: 'ok', title: 'On-screen text', detail: 'Captions/typography keep viewers watching (most watch without sound at first).' }
    : { id: 'captions', status: 'info', title: 'On-screen text', detail: 'Consider captions or kinetic typography for retention.' });
  return out;
}
