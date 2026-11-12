/** "Stick figure story" style kit (v5.2): cinematic stick figures with poses and expressions in moody sets. */
import type { MotionItem } from '../types';
import { FACES, type Face } from '../characters/stick';
import { W, T, layer, portrait, safeW, titleSize, u } from './kit';
import type { SceneCtx, SceneTemplate, Slots, StyleKit } from './types';

const PLACES = ['street', 'office', 'home', 'classroom', 'night', 'stage', 'park'];
const ground = (c: SceneCtx) => (portrait(c) ? 0.22 : 0.3);
const G = (c: SceneCtx) => c.frame.h * ground(c);
const S = (c: SceneCtx) => (portrait(c) ? c.frame.h * 0.36 : c.frame.h * 0.6);
const headY = (c: SceneCtx) => G(c) - S(c) * 0.86;
const place = (s: Slots, def: string) => (s.place && PLACES.includes(s.place) ? s.place : def);
const setL = (c: SceneCtx, s: Slots, def: string, o: Partial<MotionItem> = {}) => W(c, 'set', { kind: place(s, def), ground: ground(c), ...o });

const NEG = /\b(no|not|never|lost|lose|fail|failed|sad|alone|broke|problem|wrong|worse|bad|hard|tired|stress|afraid|fear)\b|لا|لم|فشل|حزين|مشكلة|خوف/i;
const POS = /\b(win|won|great|happy|love|best|better|success|finally|free|easy|good|yes)\b|نجح|سعيد|أفضل|رائع/i;
const WOW = /\b(suddenly|shock|crazy|insane|wow|actually|turns out|but then|unbelievable)\b|فجأة|صدمة|مذهل/i;
/** The face for a scene: the AI's mood slot, else guessed from the words. */
export function moodOf(s: Slots): Face {
  if (s.mood && (FACES as string[]).includes(s.mood)) return s.mood as Face;
  const t = `${s.title ?? ''} ${s.sub ?? ''}`;
  return WOW.test(t) ? 'surprised' : NEG.test(t) ? 'sad' : /\?|؟/.test(t) ? 'thinking' : POS.test(t) ? 'happy' : 'neutral';
}

/** The hero (same look in every scene) and a friend (ponytail, second accent). */
const hero = (c: SceneCtx, o: Partial<MotionItem>) => W(c, 'character', { size: S(c), y: G(c) - S(c) / 2, x: 0, accent: c.pal.accents[0], seed: 1, in: 'fade-in', ...o });
const friend = (c: SceneCtx, o: Partial<MotionItem>) => hero(c, { wear: 'ponytail', accent: c.pal.accents[2] ?? c.pal.accents[1] ?? c.pal.accents[0], seed: 2, facing: -1, ...o });
const title = (c: SceneCtx, s: Slots, o: Partial<MotionItem> = {}) => T(c, s.title ?? '', {
  y: -c.frame.h * (portrait(c) ? 0.33 : 0.36), size: titleSize(s.title ?? '', safeW(c) * 1.5, 84) * u(c), width: safeW(c), align: 'center', in: 'cinematic-rise',
  highlight: s.key ? [{ word: s.key, style: 'marker', bg: c.pal.accents[0], at: Math.max(0.4, c.keyAt) }] : [], ...o,
});
/** Where the hero stands and where his bubble goes (beside the head in landscape, above it in 9:16). */
function stage(c: SceneCtx, side: -1 | 1 = -1) {
  const pr = portrait(c), x = pr ? 0 : side * c.frame.w * 0.2;
  const bx = pr ? 0 : x - side * S(c) * 0.75, by = pr ? headY(c) - S(c) * 0.42 : headY(c) - S(c) * 0.12;
  return { x, bx, by, tail: [x + (pr ? 0 : -side * S(c) * 0.1) - bx, headY(c) - by] as [number, number] };
}
const bubble = (c: SceneCtx, text: string, at: { bx: number; by: number; tail: [number, number] }, kind = 'speech', o: Partial<MotionItem> = {}) =>
  W(c, 'bubble', { kind, text, x: at.bx, y: at.by, w: (portrait(c) ? 760 : 680) * u(c) * (text.length > 36 ? 1.15 : 1), h: 260 * u(c) * (text.length > 36 ? 1.2 : 1), size: Math.max(40, Math.min(64, 1500 / Math.max(10, text.length))) * u(c), tail: at.tail, start: 0.35, dur: c.dur - 0.35, ...o });
const short = (s?: string, n = 6) => (s ?? '').split(/\s+/).slice(0, n).join(' ');
/** What is said: the part after a colon (“He told her: one hour!” → “one hour!”). */
const said = (s?: string) => (s && /[:：]/.test(s) ? s.split(/[:：]/).pop()!.trim() : s ?? '');
/** Only real dates / years become a date tag. */
const isDate = (d?: string) => !!d && /\d/.test(d);

const T_: SceneTemplate[] = [
  { id: 'walk-in', name: 'Walks in', fits: ['intro', 'plain', 'date'], slots: ['title', 'key', 'place', 'date'], describe: 'the hero walks into a set (place), the headline above, a date / place tag if given',
    build: (s, c) => { const st = stage(c); const end = Math.min(1.6, c.dur * 0.5); return [setL(c, s, 'street'), hero(c, { x: st.x, poses: [{ t: 0, pose: 'walk' }, { t: end, pose: 'stand', face: moodOf(s) }], keys: [{ t: 0, x: st.x - c.frame.w * 0.3 }, { t: end, x: st.x, ease: 'ease-out' }] }), title(c, s), ...(isDate(s.date) ? [W(c, 'typewriter-tag', { text: s.date!.toUpperCase(), y: -c.frame.h * 0.24, start: 0.5, dur: c.dur - 0.5 })] : [])]; } },
  { id: 'think', name: 'Thinking', fits: ['question', 'plain'], slots: ['title', 'key', 'place'], describe: 'the hero thinks, a thought bubble with the idea (title)',
    build: (s, c) => { const st = stage(c); return [setL(c, s, 'home'), hero(c, { x: st.x, pose: 'think', face: 'thinking' }), bubble(c, short(s.title, 7), st, 'thought')]; } },
  { id: 'say', name: 'Says it', fits: ['quote', 'plain', 'intro'], slots: ['title', 'mood', 'place'], describe: 'the hero talks (mouth follows the voice) with a speech bubble (title)',
    build: (s, c) => { const st = stage(c); return [setL(c, s, 'office'), hero(c, { x: st.x, pose: 'talk', face: moodOf(s), talk: true }), bubble(c, short(said(s.title), 8), st)]; } },
  { id: 'two-talk', name: 'Conversation', fits: ['compare', 'quote', 'plain'], slots: ['left', 'right', 'place'], describe: 'two characters face each other; one says left[0], the other answers right[0]',
    build: (s, c) => {
      const pr = portrait(c), half = c.dur / 2, xa = pr ? -c.frame.w * 0.22 : -c.frame.w * 0.2, xb = -xa, sc = pr ? 0.8 : 1;
      const hy = headY(c), by = hy - S(c) * (pr ? 0.55 : 0.35);
      return [setL(c, s, 'office'), hero(c, { x: xa, size: S(c) * sc, y: G(c) - (S(c) * sc) / 2, poses: [{ t: 0, pose: 'talk' }, { t: half, pose: 'stand' }], talk: [[0, half]] }),
        friend(c, { x: xb, size: S(c) * sc, y: G(c) - (S(c) * sc) / 2, poses: [{ t: 0, pose: 'stand' }, { t: half, pose: 'talk' }], talk: [[half, c.dur]] }),
        bubble(c, short(said(s.title).length && /[:：]/.test(s.title ?? '') ? said(s.title) : s.left?.[0] ?? s.title, 8), { bx: xa + (pr ? 60 : 140) * u(c), by, tail: [-(pr ? 60 : 140) * u(c), hy - by] }, 'speech', { start: 0.3, dur: half - 0.2, out: 'fade-out' }),
        bubble(c, short(/[:：]/.test(s.title ?? '') ? s.sub ?? '?!' : s.right?.[0] ?? s.sub ?? '?!', 8), { bx: xb - (pr ? 60 : 140) * u(c), by, tail: [(pr ? 60 : 140) * u(c), hy - by] }, 'speech', { start: half + 0.1, dur: c.dur - half - 0.1 })];
    } },
  { id: 'shocked-number', name: 'Shocking number', fits: ['number', 'percent', 'money'], slots: ['value', 'label', 'place'], describe: 'a big number slams in and the hero jumps back, shocked',
    build: (s, c) => { const st = stage(c, portrait(c) ? -1 : 1); const at = Math.max(0.5, Math.min(c.keyAt, c.dur * 0.5)); const nx = portrait(c) ? 0 : -c.frame.w * 0.18, ny = portrait(c) ? -c.frame.h * 0.22 : -c.frame.h * 0.08;
      return [setL(c, s, 'stage'), hero(c, { x: st.x, poses: [{ t: 0, pose: 'stand' }, { t: at, pose: 'shocked', face: 'surprised' }], facing: portrait(c) ? 1 : -1 }), W(c, 'starburst', { x: nx, y: ny, size: 420 * u(c), start: at - 0.1, dur: c.dur - at + 0.1, color: c.pal.accents[1] ?? c.pal.accents[0] }), W(c, 'stat', { x: nx, y: ny, value: s.value ?? '100', label: s.label ?? '', size: 190 * u(c), start: at - 0.2, dur: c.dur - at + 0.2, in: 'stomp' })]; } },
  { id: 'point-chart', name: 'Points at a chart', fits: ['trend', 'number', 'percent'], slots: ['title', 'key', 'value'], describe: 'the hero points at a board whose bars grow, headline above',
    build: (s, c) => { const pr = portrait(c), bx = pr ? 0 : c.frame.w * 0.16, by = pr ? -c.frame.h * 0.08 : G(c) - 300 * u(c), hx = pr ? -c.frame.w * 0.18 : -c.frame.w * 0.22;
      return [setL(c, s, 'classroom'), W(c, 'prop', { kind: 'board', x: bx, y: by, size: (pr ? 320 : 380) * u(c), start: 0.3, dur: c.dur - 0.3, in: 'pop' }), hero(c, { x: hx, size: S(c) * (pr ? 0.8 : 1), y: G(c) - (S(c) * (pr ? 0.8 : 1)) / 2, poses: [{ t: 0, pose: 'stand' }, { t: 0.6, pose: 'point', face: 'happy' }] }), title(c, s), ...(s.value ? [W(c, 'tag', { text: s.value, x: bx, y: by - 230 * u(c), start: 1, dur: c.dur - 1 })] : [])]; } },
  { id: 'idea', name: 'Big idea', fits: ['plain', 'intro', 'trend'], slots: ['title', 'key', 'place'], describe: 'the hero thinks, then a light bulb lights up above the head and he celebrates',
    build: (s, c) => { const st = stage(c); const at = Math.max(0.8, Math.min(c.keyAt, c.dur * 0.6));
      return [setL(c, s, 'home'), hero(c, { x: st.x, poses: [{ t: 0, pose: 'think' }, { t: at, pose: 'celebrate', face: 'happy' }] }), W(c, 'prop', { kind: 'lightbulb', x: st.x, y: headY(c) - S(c) * 0.32, size: 150 * u(c), onAt: at - 0.2, start: at - 0.25, dur: c.dur - at + 0.25, in: 'elastic-pop' }), title(c, s, { x: portrait(c) ? 0 : c.frame.w * 0.2, width: portrait(c) ? safeW(c) : c.frame.w * 0.42, y: portrait(c) ? -c.frame.h * 0.36 : -c.frame.h * 0.1, start: at, dur: c.dur - at })]; } },
  { id: 'alone', name: 'Alone at night', fits: ['plain', 'quote'], slots: ['title', 'key'], describe: 'the hero stands sad under a street lamp at night, the line in muted text (bad moments)',
    build: (s, c) => [setL(c, s, 'street', { lightX: portrait(c) ? 0.1 : 0.05 }), hero(c, { x: portrait(c) ? 0 : -c.frame.w * 0.05, pose: 'sad', face: moodOf(s) === 'neutral' ? 'sad' : moodOf(s) }), title(c, s, { color: c.pal.muted, in: 'blur-in' })] },
  { id: 'celebrate', name: 'Celebrate', fits: ['outro', 'plain', 'trend'], slots: ['title', 'key', 'place'], describe: 'the hero celebrates with confetti, the headline above (wins, good news)',
    build: (s, c) => [setL(c, s, 'park'), hero(c, { x: 0, pose: 'celebrate', face: 'happy' }), W(c, 'confetti', { start: 0.3, dur: c.dur - 0.3, count: 70 }), title(c, s)] },
  { id: 'present-list', name: 'Presents a list', fits: ['list'], slots: ['items', 'title'], describe: 'the hero presents a checklist that ticks off one item at a time',
    build: (s, c) => { const pr = portrait(c); return [setL(c, s, 'classroom'), hero(c, { x: pr ? -c.frame.w * 0.24 : -c.frame.w * 0.28, size: S(c) * (pr ? 0.75 : 1), y: G(c) - (S(c) * (pr ? 0.75 : 1)) / 2, poses: [{ t: 0, pose: 'stand' }, { t: 0.4, pose: 'present', face: 'happy' }] }),
      W(c, 'checklist', { items: (s.items?.length ? s.items : [s.title ?? '']).slice(0, 4), x: pr ? c.frame.w * 0.12 : c.frame.w * 0.14, y: pr ? -c.frame.h * 0.12 : -c.frame.h * 0.05, w: (pr ? 620 : 760) * u(c), start: 0.5, dur: c.dur - 0.5 })]; } },
  { id: 'desk', name: 'At the desk', fits: ['plain', 'picture'], slots: ['title', 'key', 'mood'], describe: 'the hero sits at a desk with a glowing laptop, the line above (work, study, routine)',
    build: (s, c) => { const pr = portrait(c), x = pr ? -c.frame.w * 0.1 : -c.frame.w * 0.12, sz = S(c);
      return [setL(c, s, 'office'), W(c, 'prop', { kind: 'chair', x: x - sz * 0.05, y: G(c) - sz * 0.27, size: sz * 0.55 }), hero(c, { x, pose: 'sit', face: moodOf(s) }), W(c, 'prop', { kind: 'desk', x: x + sz * 0.62, y: G(c) - sz * 0.25, size: sz * 0.5 }), W(c, 'prop', { kind: 'laptop', x: x + sz * 0.62, y: G(c) - sz * 0.33, size: sz * 0.3 }), title(c, s)]; } },
  { id: 'shrug', name: 'Shrug', fits: ['question'], slots: ['title', 'key'], describe: 'the hero shrugs under a big question mark, the question above',
    build: (s, c) => { const st = stage(c); return [setL(c, s, 'stage'), hero(c, { x: st.x, pose: 'shrug', face: 'worried' }), T(c, '?', { x: st.x + (portrait(c) ? 160 : 200) * u(c), y: headY(c) - S(c) * 0.3, size: 260 * u(c), color: c.pal.accents[0], in: 'elastic-pop', loop: 'float' }), title(c, s)]; } },
  { id: 'run', name: 'Running', fits: ['trend', 'plain'], slots: ['title', 'key', 'place'], describe: 'the hero runs across the set with speed lines (urgency, racing time)',
    build: (s, c) => [setL(c, s, 'street'), hero(c, { pose: 'run', face: 'worried', keys: [{ t: 0, x: -c.frame.w * 0.3 }, { t: c.dur, x: c.frame.w * 0.2 }] }), W(c, 'speed-lines', { start: 0, dur: c.dur, dir: 'left' }), title(c, s)] },
  { id: 'phone', name: 'Looks at the phone', fits: ['plain', 'picture'], slots: ['title', 'key', 'mood'], describe: 'the hero looks at a glowing phone in his hand (news, messages, social media)',
    build: (s, c) => { const st = stage(c); return [setL(c, s, 'home'), hero(c, { x: st.x, pose: 'present', hold: 'phone', face: moodOf(s), look: 1 }), title(c, s)]; } },
  { id: 'versus', name: 'Two sides', fits: ['compare'], slots: ['left', 'right', 'title'], describe: 'two characters side by side with their labels (left vs right), VS in the middle',
    build: (s, c) => { const pr = portrait(c), xa = -c.frame.w * (pr ? 0.24 : 0.24), sc = pr ? 0.75 : 0.9, sz = S(c) * sc;
      return [setL(c, s, 'stage'), hero(c, { x: xa, size: sz, y: G(c) - sz / 2, pose: 'stand', face: 'neutral' }), friend(c, { x: -xa, size: sz, y: G(c) - sz / 2, pose: 'present', face: 'happy', start: 0.3, dur: c.dur - 0.3 }),
        W(c, 'tag', { text: short(s.left?.[0] ?? 'Before', 4).toUpperCase(), x: xa, y: G(c) + 50 * u(c), start: 0.4, dur: c.dur - 0.4 }), W(c, 'tag', { text: short(s.right?.[0] ?? 'After', 4).toUpperCase(), x: -xa, y: G(c) + 50 * u(c), start: 0.7, dur: c.dur - 0.7 }),
        T(c, 'VS', { y: headY(c), size: 120 * u(c), color: c.pal.accents[0], in: 'stomp', start: 0.6, dur: c.dur - 0.6 }), ...(s.title ? [title(c, s)] : [])]; } },
  { id: 'clock', name: 'Watching the clock', fits: ['date', 'plain'], slots: ['title', 'date', 'key'], describe: 'a big clock spins fast while the hero looks worried (time, waiting, deadlines)',
    build: (s, c) => { const pr = portrait(c); return [setL(c, s, 'office'), W(c, 'prop', { kind: 'clock', x: pr ? 0 : c.frame.w * 0.18, y: pr ? -c.frame.h * 0.14 : -c.frame.h * 0.1, size: 300 * u(c), speed: 4, in: 'pop' }), hero(c, { x: pr ? 0 : -c.frame.w * 0.2, size: S(c) * (pr ? 0.8 : 1), y: G(c) - (S(c) * (pr ? 0.8 : 1)) / 2, pose: 'think', face: 'worried', look: 1 }), ...(isDate(s.date) ? [W(c, 'typewriter-tag', { text: s.date!.toUpperCase(), y: -c.frame.h * 0.36 })] : [title(c, s)])]; } },
  { id: 'chapter', name: 'Chapter card', fits: ['chapter', 'intro'], slots: ['label', 'title'], describe: 'a lone figure in a spotlight with the chapter label and title',
    build: (s, c) => [setL(c, s, 'stage'), hero(c, { pose: 'stand', face: 'neutral', size: S(c) * 0.7, y: G(c) - S(c) * 0.35 }), W(c, 'tag', { text: s.label ?? 'PART 1', y: -c.frame.h * 0.34 }), title(c, s, { y: -c.frame.h * 0.24 })] },
  { id: 'wave-outro', name: 'Waves goodbye', fits: ['outro'], slots: ['title', 'sub'], describe: 'the hero waves goodbye, the closing line and a short call to action (sub)',
    build: (s, c) => [setL(c, s, 'park'), hero(c, { pose: 'wave', face: 'happy' }), title(c, s), ...(s.sub ? [W(c, 'tag', { text: s.sub, y: -c.frame.h * 0.22, start: 0.8, dur: c.dur - 0.8 })] : [])] },
];

/** Dark backdrop under the set, a slow push, soft transitions (fade through black / push) and a vignette with grain. */
export function frameStick(items: MotionItem[], c: SceneCtx): MotionItem[] {
  const out: MotionItem[] = [layer(c, { type: 'background', kind: 'flat', colors: [c.pal.bg] }), ...items];
  const cam = layer(c, { type: 'camera', keys: [{ t: 0, zoom: 1.02 }, { t: c.dur, zoom: 1.07, x: c.k % 2 ? 24 : -24, ease: 'ease' }] });
  out.push(cam);
  if (!c.last) {
    if (c.k % 2) cam.keys!.push({ t: Math.max(0, c.dur - 0.3), zoom: 1.07 }, { t: c.dur, zoom: 1.3, ease: 'ease-in' });
    else out.push(W(c, 'wipe', { start: Math.max(0, c.dur - 0.45), dur: 0.9, dir: 'left', colors: ['#000000', c.pal.bg] }));
  }
  out.push(layer(c, { type: 'light', light: 'film-grain' }), layer(c, { type: 'light', light: 'vignette' }));
  return out;
}

export const STICK: StyleKit = {
  id: 'stick', name: 'Stick figure story', genre: 'story', status: 'ready',
  description: 'Cinematic stick figures in moody sets — stories, lessons and “what if” videos.',
  includes: ['18 scene designs', '13 poses & 7 expressions', 'talks with your voice', '7 sets & props'],
  variants: [
    { id: 'dusk', name: 'Dusk', palette: { bg: '#141826', card: '#20263a', text: '#f5f6fa', muted: '#9aa3b2', accents: ['#ff9f43', '#ffd27a', '#5ac8fa'], font: 'Montserrat' } },
    { id: 'noir', name: 'Noir', palette: { bg: '#0d0d10', card: '#1c1c22', text: '#f2f2f2', muted: '#8a8a94', accents: ['#e8e8e8', '#ff4757', '#70a1ff'], font: 'Oswald' } },
    { id: 'chalk', name: 'Chalkboard', palette: { bg: '#1f3a2e', card: '#2b4a3c', text: '#f4f1e6', muted: '#a9bfb3', accents: ['#ffd23f', '#ff8fab', '#7bdff2'], font: 'Permanent Marker' } },
    { id: 'paper', name: 'Paper', palette: { bg: '#efe6d4', card: '#fbf6ea', text: '#1f1e1d', muted: '#6b645a', accents: ['#d8342c', '#1f4fa8', '#e9a23b'], font: 'Montserrat' } },
  ],
  font: 'Montserrat', templates: T_, frameScene: frameStick,
  cues: [
    [/\b(meet|this is)\b|^هذا|^هذه/i, 'walk-in'],
    [/\b(told|said|asked|says|tells) (his|her|my|the) (friend|boss|wife|husband|mom|dad|mother|father|colleague)|لصديق|لمدير/i, 'two-talk'],
    [/\b(said|told|says|asked)\b|: |قال|سأل/i, 'say'],
    [/nothing (changed|worked)|tried everything|لم يتغير/i, 'shrug'],
    [/\b(alone|gave up|give up|lonely)\b|وحيد|يستسلم/i, 'alone'],
    [/\b(clicked|idea|reali[sz]ed|what if)\b|فكرة|ماذا لو/i, 'idea'],
    [/\b(smiled|celebrate|finally|won)\b|ابتسم|نجح/i, 'celebrate'],
    [/\b(ran|run|running|late|hurry|rush)\b|يركض|متأخر/i, 'run'],
    [/\b(desk|office|work|study)\b|مكتب|العمل/i, 'desk'],
    [/\b(phone|scroll|notifications?|messages?)\b|هاتف/i, 'phone'],
    [/\b(clock|deadline|minutes)\b|الساعة تدق/i, 'clock'],
    [/[?؟]/, 'think'],
  ],
  direction: `Cinematic stick-figure story: one hero (and sometimes a friend) acting out the narration in moody sets with a warm rim light, short speech / thought bubbles, few words on screen. Pick designs where the hero's pose shows the feeling. Extra slots: mood = ${FACES.join(' | ')}; place = ${PLACES.join(' | ')}. Keep bubbles ≤ 8 words.`,
  storyShape: 'setup (who and where) → the problem → it gets worse → the turning point → the change → the lesson',
  preview: [
    { template: 'walk-in', slots: { title: 'Meet Sam', key: 'Sam', place: 'street' } },
    { template: 'idea', slots: { title: 'Then it clicked', key: 'clicked' } },
    { template: 'say', slots: { title: 'Every morning, one hour!', mood: 'happy' } },
  ],
};
