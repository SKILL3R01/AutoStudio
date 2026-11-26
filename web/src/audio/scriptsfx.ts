import { addTrack, newAudioClip } from '../lib/audiotracks';
import type { Asset, Project, Word } from '../types';

/**
 * Sound effects from the script: words in the narration ("walked", "sighed", "screamed", "knock"…) become sound cues
 * that start on the spoken word. Each cue uses a matching file from Media (a sound pack the user imported, picked by
 * file name) or a built-in synth sound; sounds with no built-in version need a file.
 */
export interface SfxRule {
  id: string;
  label: string;
  /** Whole words (lower case, no punctuation) that call for the sound — English and Arabic. */
  words: string[];
  /** Built-in synth sound (audio/sfx.ts), when there is one. */
  synth?: string;
  /** Length of the cue in seconds (files are cut to this, up to their own length). */
  dur: number;
  /** File-name keywords that match a sound file in Media. */
  files: string[];
}

export const SFX_RULES: SfxRule[] = [
  { id: 'steps', label: 'Footsteps', synth: 'steps', dur: 2, files: ['footstep', 'footsteps', 'steps', 'walking', 'walk', 'running'],
    words: ['walk', 'walks', 'walked', 'walking', 'step', 'steps', 'stepped', 'footsteps', 'footstep', 'ran', 'run', 'runs', 'running', 'stairs', 'paced', 'pacing', 'marched', 'strode', 'مشى', 'يمشي', 'مشيت', 'ركض', 'يركض', 'خطوات', 'خطوة'] },
  { id: 'breath', label: 'Breathing', synth: 'breath', dur: 2.2, files: ['breath', 'breathing', 'sigh', 'gasp', 'pant', 'inhale', 'exhale'],
    words: ['breath', 'breathe', 'breathes', 'breathed', 'breathing', 'sigh', 'sighs', 'sighed', 'exhale', 'exhaled', 'inhale', 'inhaled', 'panting', 'gasp', 'gasped', 'تنفس', 'يتنفس', 'تنهد', 'نفس'] },
  { id: 'scream', label: 'Scream', dur: 2, files: ['scream', 'screaming', 'shout', 'yell'],
    words: ['scream', 'screams', 'screamed', 'screaming', 'shout', 'shouted', 'shouting', 'yell', 'yelled', 'yelling', 'صرخ', 'يصرخ', 'صراخ', 'صرخة'] },
  { id: 'knock', label: 'Door / knock', synth: 'knock', dur: 1, files: ['knock', 'knocking', 'door'],
    words: ['knock', 'knocks', 'knocked', 'knocking', 'door', 'doors', 'doorbell', 'باب', 'الباب', 'طرق', 'يطرق'] },
  { id: 'heartbeat', label: 'Heartbeat', synth: 'heartbeat', dur: 2, files: ['heartbeat', 'heart beat', 'heart', 'pulse'],
    words: ['heart', 'heartbeat', 'pulse', 'nervous', 'anxious', 'anxiety', 'panic', 'قلب', 'قلبه', 'قلبي', 'خوف', 'توتر'] },
  { id: 'thunder', label: 'Thunder', synth: 'thunder', dur: 3.5, files: ['thunder', 'storm', 'lightning'],
    words: ['thunder', 'lightning', 'storm', 'stormy', 'رعد', 'برق', 'عاصفة'] },
  { id: 'rain', label: 'Rain', synth: 'rain', dur: 4, files: ['rain', 'raining', 'drizzle'],
    words: ['rain', 'raining', 'rainy', 'rained', 'drizzle', 'مطر', 'المطر', 'تمطر'] },
  { id: 'wind', label: 'Wind', synth: 'wind', dur: 3.5, files: ['wind', 'breeze', 'gust'],
    words: ['wind', 'windy', 'breeze', 'gust', 'رياح', 'ريح', 'نسيم'] },
  { id: 'phone', label: 'Phone / message', synth: 'ding', dur: 1.6, files: ['notification', 'phone', 'ringtone', 'message', 'text tone', 'ring'],
    words: ['phone', 'notification', 'notifications', 'texted', 'buzzed', 'ringing', 'rang', 'هاتف', 'الهاتف', 'رسالة', 'جوال'] },
  { id: 'laugh', label: 'Laugh', dur: 2, files: ['laugh', 'laughing', 'laughter', 'giggle'],
    words: ['laugh', 'laughs', 'laughed', 'laughing', 'laughter', 'giggled', 'ضحك', 'يضحك', 'ضحكة'] },
  { id: 'crowd', label: 'Crowd / applause', dur: 3, files: ['crowd', 'applause', 'cheer', 'clapping', 'audience'],
    words: ['crowd', 'audience', 'applause', 'clapped', 'clapping', 'cheered', 'cheering', 'جمهور', 'تصفيق', 'حشد'] },
  { id: 'impact', label: 'Crash / hit', synth: 'impact', dur: 1, files: ['crash', 'impact', 'slam', 'punch', 'hit', 'smash'],
    words: ['crash', 'crashed', 'slammed', 'slam', 'punch', 'punched', 'smashed', 'collapsed', 'اصطدم', 'تحطم', 'ضرب'] },
  { id: 'typing', label: 'Typing', synth: 'typing', dur: 1.2, files: ['typing', 'keyboard'],
    words: ['typed', 'typing', 'keyboard', 'يكتب', 'كتب'] },
  { id: 'camera', label: 'Camera', synth: 'shutter', dur: 0.4, files: ['camera', 'shutter', 'photo'],
    words: ['photo', 'photos', 'camera', 'snapped', 'صورة', 'كاميرا'] },
  { id: 'pen', label: 'Writing', synth: 'pen', dur: 0.6, files: ['pen', 'writing', 'pencil', 'scribble'],
    words: ['wrote', 'writing', 'notebook', 'pen', 'scribbled', 'دفتر', 'قلم'] },
  { id: 'page', label: 'Page turn', synth: 'paper', dur: 0.6, files: ['page', 'paper', 'book'],
    words: ['page', 'pages', 'flipped', 'صفحة'] },
];

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
  /** Media file used, else the built-in sound; neither = a file is needed. */
  assetId?: string;
  fileName?: string;
  sound?: string;
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
    if (!rule || w.start - prev < gap || w.start - (last.get(rule.id) ?? -Infinity) < repeatGap) return;
    const files = libraryMatches(p, rule);
    const n = used.get(rule.id) ?? 0;
    const file = files.length ? files[n % files.length] : undefined;
    const dur = file ? Math.min(file.duration ?? rule.dur, Math.max(rule.dur, 1) * 1.5) : rule.dur;
    cues.push({
      id: `${rule.id}_${Math.round(w.start * 100)}`, rule: rule.id, label: rule.label, word: w.text.replace(/[^\p{L}\p{N}'’-]/gu, ''),
      context: words.slice(Math.max(0, i - 3), i + 4).map((x) => x.text).join(' '), t: w.start, dur,
      assetId: file?.id, fileName: file?.name, sound: file ? undefined : rule.synth, on: !!(file || rule.synth),
    });
    used.set(rule.id, n + 1);
    last.set(rule.id, w.start);
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
