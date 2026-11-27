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
  /** Whole words (lower case, no punctuation) that call for the sound on their own — English and Arabic. */
  words: string[];
  /**
   * Anchor + action pairs: the sound plays when an anchor word ("door") has an action word ("buzzing") within
   * ±3 words; it starts on the action word. Anchors never make a sound on their own.
   */
  pairs?: [string[], string[]][];
  /** Words within ±3 that cancel the match ("run a business", "3 simple steps"). `#` = any number. */
  not?: string[];
  /** Longest useful length in seconds (recordings and files are cut to this, up to their own length). */
  dur: number;
  /** File-name keywords that match a sound file in Media. */
  files: string[];
}

const R = (id: string, label: string, dur: number, files: string[], words: string, more: { pairs?: [string, string][]; not?: string } = {}): SfxRule => ({
  id, label, dur, files, words: words ? words.split(' ') : [],
  pairs: more.pairs?.map(([a, b]) => [a.split(' '), b.split(' ')]), not: more.not?.split(' '),
});
const DOOR = 'door doors frontdoor باب الباب البوابة';
const PHONE = 'phone phones mobile cellphone smartphone هاتف الهاتف هاتفه هاتفي هاتفها جوال الجوال';
const NUMBERS = '# one two three four five six seven eight nine ten';
/**
 * Each rule plays real recordings from the bundled CC0 pack (audio/pack), unless a matching file is in Media.
 * Order matters for pairs: the first rule whose action word is near the anchor wins ("the door slammed shut" = slam).
 */
export const SFX_RULES: SfxRule[] = [
  R('slam', 'Door slam', 1, ['slam', 'slamming'], 'slam slams slammed slamming', { pairs: [[DOOR, 'slam slams slammed slamming صفق صفقت']] }),
  R('buzzer', 'Door buzzer', 2, ['buzzer', 'intercom'], 'buzzer intercom', { pairs: [[DOOR, 'buzz buzzes buzzed buzzing يطن طن أزيز']] }),
  R('doorbell', 'Doorbell', 3, ['doorbell', 'door bell', 'chime'], 'doorbell doorbells', { pairs: [[DOOR + ' bell جرس', 'rang ring rings ringing chimed chime chimes رن يرن']] }),
  R('dooropen', 'Door opening', 3.5, ['door open', 'creak'], '', { pairs: [[DOOR, 'open opens opened opening creak creaks creaked creaking unlocked unlocks swung فتح فتحت يفتح تفتح انفتح']] }),
  R('doorclose', 'Door closing', 3, ['door close', 'door closing'], '', { pairs: [[DOOR, 'close closes closed closing shut shuts أغلق أغلقت يغلق تغلق أقفل']] }),
  R('knock', 'Knock', 2.5, ['knock', 'knocking'], 'knock knocks knocked knocking طرق يطرق طرقت دق يدق'),
  R('ring', 'Phone ringing', 4, ['ringtone', 'phone ring', 'telephone'], 'ringtone', { pairs: [[PHONE + ' telephone', 'ring rings rang ringing رن يرن']] }),
  R('buzz', 'Phone buzz', 3, ['vibrate', 'vibration', 'phone buzz'], 'vibrated vibrating', { pairs: [[PHONE, 'buzz buzzes buzzed buzzing vibrate vibrates اهتز يهتز']] }),
  R('message', 'Message tone', 2, ['notification', 'message', 'text tone', 'sms'], 'texted notification notifications pinged', { pairs: [['message messages text texts رسالة رسائل', 'got received arrived came new incoming popped ping pinged وصلت جاءت وصلته']] }),
  R('steps', 'Footsteps', 4, ['footstep', 'footsteps', 'walking', 'walk'], 'walk walks walked walking step steps stepped footsteps footstep stairs paced pacing marched strode tiptoed مشى يمشي مشيت خطوات خطوة', { not: `${NUMBERS} next first few simple these small baby easy key practical through away مهمة بسيطة` }),
  R('run', 'Running', 3.5, ['running', 'run', 'sprint'], 'ran run runs running raced rushed sprinted sprinting ركض يركض ركضت', { not: 'business businesses company out long errand errands numbers ads campaign test tests script code program show shop store' }),
  R('breath', 'Breathing', 4.5, ['breath', 'breathing', 'inhale', 'exhale'], 'breath breathe breathes breathed breathing inhale inhaled exhale exhaled تنفس يتنفس تنفست', { not: 'fresh' }),
  R('pant', 'Out of breath', 4, ['pant', 'panting', 'breathless', 'gasp'], 'panting panted gasp gasped gasping breathless لهث يلهث'),
  R('sigh', 'Sigh', 3, ['sigh'], 'sigh sighs sighed sighing تنهد يتنهد تنهدت'),
  R('scream', 'Scream', 3, ['scream', 'screaming', 'shout', 'yell'], 'scream screams screamed screaming shout shouted shouting yell yelled yelling صرخ يصرخ صراخ صرخة'),
  R('heartbeat', 'Heartbeat', 4.5, ['heartbeat', 'heart beat', 'heart', 'pulse'], 'heartbeat heartbeats palpitations', { pairs: [['heart hearts قلب قلبه قلبي قلبها', 'pounding pounded pounds racing raced races beating beat beats thumping thumped hammering يدق ينبض خفق يخفق']] }),
  R('thunder', 'Thunder', 6, ['thunder', 'storm', 'lightning'], 'thunder thunderstorm lightning رعد برق'),
  R('rain', 'Rain', 6, ['rain', 'raining', 'drizzle'], 'rain raining rainy rained drizzle downpour مطر المطر تمطر'),
  R('wind', 'Wind', 6, ['wind', 'breeze', 'gust'], 'wind windy breeze gust gusts رياح ريح نسيم', { not: 'down up' }),
  R('laugh', 'Laugh', 4, ['laugh', 'laughing', 'laughter', 'giggle'], 'laugh laughs laughed laughing laughter giggled ضحك يضحك ضحكة'),
  R('crowd', 'Applause', 5, ['applause', 'clapping', 'cheer', 'crowd'], 'applause applauded clapped clapping cheered cheering ovation تصفيق صفقوا'),
  R('punch', 'Punch / hit', 1.2, ['punch', 'hit', 'slap', 'impact'], 'punch punched punches slapped struck لكم لكمة', { not: 'line lines' }),
  R('glass', 'Glass breaking', 2.5, ['glass', 'shatter', 'smash', 'crash', 'break'], 'shattered smashed crash crashed تحطم انكسر', { not: 'market markets stock stocks prices economy course' }),
  R('typing', 'Keyboard typing', 3.5, ['typing', 'keyboard'], 'typed typing keyboard keystrokes'),
  R('camera', 'Camera', 1.2, ['camera', 'shutter', 'photo'], 'snapped', { pairs: [['photo photos picture pictures camera صورة صور كاميرا', 'took take taking snapped snap clicked click التقط التقطت']] }),
  R('pen', 'Writing', 3, ['pen', 'pencil', 'writing', 'scribble'], 'scribbled jotted', { pairs: [['wrote write writes writing كتب يكتب كتبت', 'pen pencil notebook paper down letter note notes قلم ورقة دفتر']] }),
  R('page', 'Page turn', 1.8, ['page', 'paper', 'book'], '', { pairs: [['page pages book صفحة الصفحة', 'turned turn turns turning flipped flip flipping قلب يقلب']] }),
];

/** Related sounds share one repeat timer (walking then running gives one footsteps sound within 8 s). */
const FAMILY: Record<string, string> = { run: 'steps', pant: 'breath', sigh: 'breath', buzz: 'phone', ring: 'phone', message: 'phone' };
const SINGLE_OF = new Map(SFX_RULES.flatMap((r) => r.words.map((w) => [w, r] as const)));
const ANCHOR_OF = new Map<string, { rule: SfxRule; actions: Set<string> }[]>();
for (const rule of SFX_RULES) for (const [anchors, actions] of rule.pairs ?? []) for (const a of anchors) ANCHOR_OF.set(a, [...(ANCHOR_OF.get(a) ?? []), { rule, actions: new Set(actions) }]);
const NOT_OF = new Map(SFX_RULES.map((r) => [r.id, new Set(r.not ?? [])]));
const WIN = 3;
/** Lower case, punctuation and Arabic diacritics removed. */
export const normWord = (w: string) => w.toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/['’]s$/, '').replace(/^\d+$/, '#');
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
  const toks = words.map((w) => normWord(w.text));
  const used = toks.map(() => false);
  /** Nearest unused word within ±WIN of i that is in `set` (after first, then before). */
  const near = (i: number, set: Set<string>) => {
    for (let d = 1; d <= WIN; d++) for (const j of [i + d, i - d]) if (j >= 0 && j < toks.length && !used[j] && set.has(toks[j])) return j;
    return -1;
  };
  const cancelled = (rule: SfxRule, i: number) => NOT_OF.get(rule.id)!.size > 0 && near(i, NOT_OF.get(rule.id)!) >= 0;
  const last = new Map<string, number>();
  const count = new Map<string, number>();
  const cues: SfxCue[] = [];
  let prev = -Infinity;
  toks.forEach((tok, i) => {
    if (used[i]) return;
    let rule: SfxRule | undefined;
    let at = i;
    for (const pr of ANCHOR_OF.get(tok) ?? []) {
      const j = near(i, pr.actions);
      if (j >= 0 && !cancelled(pr.rule, i)) {
        rule = pr.rule;
        at = j;
        used[i] = true;
        break;
      }
    }
    if (!rule) {
      const r = SINGLE_OF.get(tok);
      if (!r || cancelled(r, i)) return;
      rule = r;
    }
    used[at] = true;
    const w = words[at];
    const fam = FAMILY[rule.id] ?? rule.id;
    if (w.start - prev < gap || w.start - (last.get(fam) ?? -Infinity) < repeatGap) return;
    const files = libraryMatches(p, rule);
    const n = count.get(rule.id) ?? 0;
    const file = files.length ? files[n % files.length] : undefined;
    const recs = packFor(rule.id);
    const rec = file || !recs.length ? undefined : recs[n % recs.length];
    const dur = Math.min(file?.duration ?? rec?.duration ?? rule.dur, rule.dur);
    cues.push({
      id: `${rule.id}_${Math.round(w.start * 100)}`, rule: rule.id, label: rule.label, word: w.text.replace(/[^\p{L}\p{N}'’-]/gu, ''),
      context: words.slice(Math.max(0, at - 3), at + 4).map((x) => x.text).join(' '), t: w.start, dur,
      assetId: file?.id, fileName: file?.name, sound: rec && `rec:${rec.id}`, credit: rec && `${rec.title} · ${rec.author}`, on: !!(file || rec),
    });
    count.set(rule.id, n + 1);
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
