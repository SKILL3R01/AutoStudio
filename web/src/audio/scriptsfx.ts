import { addTrack, newAudioClip } from '../lib/audiotracks';
import type { Asset, Project, Word } from '../types';
import { packFor } from './pack';

/**
 * Sound effects from the script: words in the narration ("walked", "sighed", "screamed", "knock"…) become sound cues
 * that start on the spoken word. Each cue uses a matching file from Media (a sound pack the user imported, picked by
 * file name) or a real recording from the bundled CC0 pack.
 */
export interface SfxRule {
  id: string;
  label: string;
  /** Whole words (lower case, no punctuation) that call for the sound — English and Arabic. */
  words: string[];
  /** Longest useful length in seconds (recordings and files are cut to this, up to their own length). */
  dur: number;
  /** File-name keywords that match a sound file in Media. */
  files: string[];
}

const R = (id: string, label: string, dur: number, files: string[], words: string) => ({ id, label, dur, files, words: words.split(' ') });
/** Each rule plays real recordings from the bundled CC0 pack (audio/pack), unless a matching file is in Media. */
export const SFX_RULES: SfxRule[] = [
  R('steps', 'Footsteps', 4, ['footstep', 'footsteps', 'steps', 'walking', 'walk'], 'walk walks walked walking step steps stepped footsteps footstep stairs paced pacing marched strode مشى يمشي مشيت خطوات خطوة'),
  R('run', 'Running', 3.5, ['running', 'run', 'sprint'], 'ran run runs running raced rushed sprinted sprinting ركض يركض ركضت'),
  R('breath', 'Breathing', 4.5, ['breath', 'breathing', 'inhale', 'exhale'], 'breath breathe breathes breathed breathing inhale inhaled exhale exhaled تنفس يتنفس تنفست'),
  R('pant', 'Out of breath', 4, ['pant', 'panting', 'breathless', 'gasp'], 'panting panted gasp gasped gasping breathless لهث يلهث'),
  R('sigh', 'Sigh', 3, ['sigh'], 'sigh sighs sighed sighing تنهد يتنهد تنهدت'),
  R('scream', 'Scream', 3, ['scream', 'screaming', 'shout', 'yell'], 'scream screams screamed screaming shout shouted shouting yell yelled yelling صرخ يصرخ صراخ صرخة'),
  R('knock', 'Knock', 2.5, ['knock', 'knocking'], 'knock knocks knocked knocking طرق يطرق طرقت'),
  R('door', 'Door', 3, ['door'], 'door doors slammed slam باب الباب'),
  R('heartbeat', 'Heartbeat', 4.5, ['heartbeat', 'heart beat', 'heart', 'pulse'], 'heart heartbeat heartbeats pulse nervous anxious anxiety panic قلب قلبه قلبي توتر'),
  R('thunder', 'Thunder', 6, ['thunder', 'storm', 'lightning'], 'thunder lightning storm stormy رعد برق عاصفة'),
  R('rain', 'Rain', 6, ['rain', 'raining', 'drizzle'], 'rain raining rainy rained drizzle مطر المطر تمطر'),
  R('wind', 'Wind', 6, ['wind', 'breeze', 'gust'], 'wind windy breeze gust رياح ريح نسيم'),
  R('message', 'Message tone', 2, ['notification', 'message', 'text tone', 'sms'], 'message messages texted notification notifications رسالة رسائل إشعار'),
  R('buzz', 'Phone buzz', 3, ['vibrate', 'vibration', 'phone', 'buzz'], 'phone vibrated vibrating buzzed buzzing هاتف الهاتف جوال'),
  R('laugh', 'Laugh', 4, ['laugh', 'laughing', 'laughter', 'giggle'], 'laugh laughs laughed laughing laughter giggled ضحك يضحك ضحكة'),
  R('crowd', 'Applause', 5, ['applause', 'clapping', 'cheer', 'crowd'], 'applause applauded clapped clapping cheered cheering ovation تصفيق صفقوا'),
  R('punch', 'Punch / hit', 1.2, ['punch', 'hit', 'slap', 'impact'], 'punch punched punches slapped struck لكم لكمة'),
  R('glass', 'Glass breaking', 2.5, ['glass', 'shatter', 'smash', 'crash', 'break'], 'shattered smashed crash crashed تحطم انكسر'),
  R('typing', 'Keyboard typing', 3.5, ['typing', 'keyboard'], 'typed typing keyboard keystrokes'),
  R('camera', 'Camera', 1.2, ['camera', 'shutter', 'photo'], 'photo photos camera snapped صورة كاميرا'),
  R('pen', 'Writing', 3, ['pen', 'pencil', 'writing', 'scribble'], 'wrote writing scribbled notebook pen pencil signed كتب يكتب دفتر قلم'),
  R('page', 'Page turn', 1.8, ['page', 'paper', 'book'], 'page pages flipped صفحة'),
];

/** Related sounds share one repeat timer ("a knock at the door" gives one knock, not a knock and a slam). */
const FAMILY: Record<string, string> = { door: 'knock', run: 'steps', pant: 'breath', sigh: 'breath', buzz: 'message' };
const RULE_OF = new Map(SFX_RULES.flatMap((r) => r.words.map((w) => [w, r] as const)));
/** Lower case, punctuation and Arabic diacritics removed. */
export const normWord = (w: string) => w.toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/['’]s$/, '');
const normName = (n: string) => ` ${n.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[_\-.()[\]]+/g, ' ')} `;

export interface SfxCue {
  id: string;
  rule: string;
  label: string;
  /** The spoken word and a few words around it. */
  word: string;
  context: string;
  t: number;
  dur: number;
  /** Media file used, else a pack recording (`rec:<id>`); neither = a file is needed. */
  assetId?: string;
  fileName?: string;
  sound?: string;
  /** Title and author of the pack recording. */
  credit?: string;
  on: boolean;
}

/** Sound files in Media that match a rule (by file name), excluding the narration / music in use. */
export function libraryMatches(p: Project, rule: SfxRule): Asset[] {
  const busy = new Set(p.audio.filter((c) => p.audioTracks.find((t) => t.id === c.trackId)?.kind !== 'sfx').map((c) => c.assetId));
  return p.assets.filter((a) => a.kind === 'audio' && !busy.has(a.id) && rule.files.some((k) => normName(a.name).includes(` ${k}`)));
}

/**
 * Find the sound cues in the narration. A sound repeats at most every `repeatGap` s, and cues are at least `gap` s apart
 * (the first one wins), so the result stays sparse.
 */
export function findSfxCues(p: Project, opts: { gap?: number; repeatGap?: number } = {}): SfxCue[] {
  const { gap = 1.5, repeatGap = 8 } = opts;
  const words: Word[] = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const last = new Map<string, number>();
  const used = new Map<string, number>();
  const cues: SfxCue[] = [];
  let prev = -Infinity;
  words.forEach((w, i) => {
    const rule = RULE_OF.get(normWord(w.text));
    const fam = rule && (FAMILY[rule.id] ?? rule.id);
    if (!rule || !fam || w.start - prev < gap || w.start - (last.get(fam) ?? -Infinity) < repeatGap) return;
    const files = libraryMatches(p, rule);
    const n = used.get(rule.id) ?? 0;
    const file = files.length ? files[n % files.length] : undefined;
    const recs = packFor(rule.id);
    const rec = file || !recs.length ? undefined : recs[n % recs.length];
    const dur = Math.min(file?.duration ?? rec?.duration ?? rule.dur, rule.dur);
    cues.push({
      id: `${rule.id}_${Math.round(w.start * 100)}`, rule: rule.id, label: rule.label, word: w.text.replace(/[^\p{L}\p{N}'’-]/gu, ''),
      context: words.slice(Math.max(0, i - 3), i + 4).map((x) => x.text).join(' '), t: w.start, dur,
      assetId: file?.id, fileName: file?.name, sound: rec && `rec:${rec.id}`, credit: rec && `${rec.title} · ${rec.author}`, on: !!(file || rec),
    });
    used.set(rule.id, n + 1);
    last.set(fam, w.start);
    prev = w.start;
  });
  return cues;
}

const SCRIPT_TRACK = 'Script sounds';

/** Put the chosen cues on a "Script sounds" SFX track (replacing the previous script sounds). Returns how many were added. */
export function applySfxCues(p: Project, cues: SfxCue[], volume = 0.5): number {
  removeScriptSounds(p);
  const chosen = cues.filter((c) => c.on && (c.assetId || c.sound)).sort((a, b) => a.t - b.t);
  if (!chosen.length) return 0;
  const tid = p.audioTracks.find((x) => x.kind === 'sfx' && x.name === SCRIPT_TRACK)?.id ?? addTrack(p, 'sfx', SCRIPT_TRACK);
  p.audioTracks.find((x) => x.id === tid)!.custom = true;
  chosen.forEach((c, i) => {
    // One track: a sound stops just before the next one starts.
    const dur = Math.max(0.2, Math.min(c.dur, (chosen[i + 1]?.t ?? Infinity) - c.t - 0.05));
    p.audio.push(newAudioClip(tid, c.assetId ?? '', c.t, dur, 'sfx', { id: `asfx_${c.id}`, sound: c.assetId ? undefined : c.sound, volume, fadeOut: Math.min(0.4, dur / 4) }));
  });
  return chosen.length;
}

export const hasScriptSounds = (p: Project) => p.audio.some((c) => c.id.startsWith('asfx_'));

export function removeScriptSounds(p: Project) {
  p.audio = p.audio.filter((c) => !c.id.startsWith('asfx_'));
}
