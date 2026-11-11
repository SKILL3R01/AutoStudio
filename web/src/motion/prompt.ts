/** Motion Studio prompt: the "contract" sent to Claude / ChatGPT / Gemini / the local assistant. Built from our real vocabulary. */
import type { MotionPlacement } from './types';
import { PALETTES } from './recipe';
import { LUCIDE } from './lucide';

export const MOTION_FONTS = ['Montserrat', 'Poppins', 'Bebas Neue', 'Anton', 'Oswald', 'Playfair Display', 'League Spartan', 'Archivo Black', 'Barlow Condensed', 'Bungee', 'Inter', 'Permanent Marker', 'Caveat Brush', 'Pacifico', 'Cairo', 'Tajawal', 'Almarai', 'Changa', 'El Messiri', 'Reem Kufi', 'Lalezar', 'Amiri', 'Noto Kufi Arabic', 'Noto Naskh Arabic'];
export const TEXT_INS = ['fade-in', 'cinematic-rise', 'line-rise', 'slide-up', 'drop-bounce', 'pop-up', 'elastic-pop', 'stomp', 'blur-in', 'pro-rise-glow', 'wipe-reveal', 'saas-mask-up', 'typewriter', 'saas-words', 'slide-left-words', 'glitch-in', 'neon-flicker', 'rotate-in', 'zoom-blur-in'];
export const TEXT_OUTS = ['fade-out', 'blur-out', 'slide-up-out', 'zoom-out', 'wipe-hide', 'pop-out', 'glitch-out', 'backspace'];
export const LOOPS = ['float', 'pulse', 'shake', 'swing', 'rotate-slow', 'ken-burns', 'heartbeat'];
export const ITEM_INS = ['fade-in', 'rise-up', 'pop', 'overshoot-pop', 'zoom-in', 'blur-in', 'draw-on', 'slide-from-left', 'slide-from-right', 'slide-from-top', 'slide-from-bottom', 'drop-in', 'spin-in', 'flip-in', 'whip-in', 'marker-wipe'];
export const BG_KINDS = ['flat', 'gradient', 'glow', 'spotlight', 'mesh', 'aurora', 'wave', 'paper', 'grid', 'dots', 'lines', 'hud', 'floor', 'split'];
export const LIGHTS = ['film-grain', 'vignette', 'light-sweep', 'light-leak-warm', 'lens-flare', 'cinematic-bars'];

/** Widgets the recipe may use: id → fields. Until a widget is drawn natively it shows as a labelled card. */
export const WIDGETS: Record<string, string> = {
  headline: '{title, gold:"key word", sub:"SPACED CAPS LINE", size:96, gradient:["#c1","#c2"], align}',
  kinetic: '{lines:["…","…"], highlight:["word"], size}',
  say: '{text:"" (empty = the narration words with their real timings), key:["word"], size, pill:true}',
  tag: '{text:"LABEL"}',
  quote: '{text, name, role, highlight:["word"]}',
  cards: '{items:[{icon, title, sub, color}], w, cardH}',
  chips: '{items:[{icon, title, sub}]}',
  checklist: '{items:["…"], w}',
  steps: '{items:["idea","script","result"], dir:"ltr"|"rtl"}',
  compare: '{left:{title, items:[…]}, right:{title, items:[…]}, vs:"VS"}',
  bento: '{cells:[{type:"stat",value,label},{type:"chart",values:[…]},{type:"text",text},{type:"icon",icon}], w, h}',
  stat: '{value:"+1,200", label, size}',
  'chart-line': '{values:[3,5,4,8], value:"$2.4M", label, delta:"+31%", w, h}',
  bars: '{values:[40,70,55,90], labels:["Q1","Q2","Q3","Q4"], suffix:"%", w, h}',
  donut: '{value:75, label, size}',
  progress: '{value:70, label, w}',
  window: '{title, lines:["…"], code:true, w, h}',
  phone: '{title, messages:[{text, me:true}], w}',
  chat: '{messages:[{text, me:true, name}], w}',
  typing: '{text, placeholder, button:"Send", w}',
  cursor: '{points:[[x,y],[x,y,"click"]] (frame coords), style:"arrow"|"hand"}',
  'click-pulse': '{x, y, at:[0.5]}',
  button: '{text, icon, press:2.0, w}',
  'logo-reveal': '{name, tagline, size, gradient:["#c1","#c2"]}',
  burst: '[transition] {x, y, colors:[…], dur:1.1} — start 0.5 s before the cut',
  wipe: '[transition] {dir:"left"|"right"|"up"|"down", colors:[…], dur:1}',
  slices: '[transition] {count:10, colors:[…], dir:"up"|"down", dur:1}',
  'band-wipe': '[transition] {colors:[…], dir:"right"|"left", dur:1.1}',
  sparkles: '{x, y, count:7, spread:320, color, at:[0.4]}',
  rays: '{x, y, n:16, color, size, flashes:[0.8]} — always behind',
  'speed-lines': '{dir:"left"|"right"|"radial", count:22, color}',
  'light-streaks': '{color, count:6, y, at:[0.3]}',
  arrow: '{from:[x,y], to:[x,y], bend:0.3, color} (frame coords, draws on)',
  'circle-draw': '{x, y, w, h, color} (hand-drawn circle around something)',
  confetti: '{x, y, count:40, colors:[…]}',
};

export interface PromptOptions {
  idea: string;
  placement: MotionPlacement;
  aspect: string;
  length: string;
  style: string;
  language: 'auto' | 'en' | 'ar';
  /** Narration in the chosen range: "0.42 word" lines, times relative to the recipe start. */
  narration?: { t: number; w: string }[];
  assets?: string[];
}

export function frameFor(placement: MotionPlacement, aspect: string) {
  if (placement === 'band') return { w: 1920, h: 540 };
  if (aspect === '9:16') return { w: 1080, h: 1920 };
  if (aspect === '1:1') return { w: 1080, h: 1080 };
  if (aspect === '4:5') return { w: 1080, h: 1350 };
  return { w: 1920, h: 1080 };
}

export function buildMotionPrompt(o: PromptOptions): string {
  const f = frameFor(o.placement, o.aspect);
  const safe = { x: Math.round(f.w * 0.44), y: Math.round(f.h * 0.42) };
  const ar = o.language === 'ar' || (o.language === 'auto' && /[\u0600-\u06ff]/.test(o.idea));
  const where = o.placement === 'band' ? 'the TOP band of a split-screen vertical reel (the person talking fills the other half — not in your recipe)'
    : o.placement === 'overlay' ? 'a TRANSPARENT layer over my video: no full-frame backgrounds, keep the centre mostly clear, use cards / titles / callouts at the sides'
    : 'the FULL frame (the motion graphics are the whole picture)';
  const style = o.style === 'free' ? 'Free: invent a bold, coherent art direction for THIS idea (palette 3–5 colours, a font pairing, a motif that links the scenes, a camera language). Never the default "dark radial background + neon ring + big title".'
    : `Use the palette "${o.style}" and its mood.`;
  const narr = o.narration?.length ? `\nVOICE (sync to it — times in seconds from the recipe start; land each key word / number on its spoken word, one beat per sentence):\n${o.narration.map((w) => `${w.t.toFixed(2)} ${w.w}`).join(' ')}\n` : '';
  const icons = Object.keys(LUCIDE).join(', ');
  return `TASK: you are a top After Effects motion designer. Design a premium motion-graphics sequence for my video editor AutoStudio and answer with ONE valid JSON object only (it starts with { and ends with }). No explanation, no markdown, no code fences, no comments. Never HTML / CSS / JavaScript / React / SVG pages — AutoStudio turns the JSON into editable, animatable layers.${ar ? '\nالمهمة: صمم موشن جرافيك احترافي ورد بـ JSON واحد سليم فقط. النصوص بالعربي.' : ''}

MY IDEA:
${o.idea.trim() || '(no idea given — invent a strong one)'}
${narr}
LENGTH: ${o.length === 'auto' ? 'as the idea needs (usually 10–25 s)' : `${o.length} s`} — one beat every 2.5–4 s.
STYLE: ${style}
WHERE: ${where}. Frame ${f.w}×${f.h} px, 30 fps. x / y = pixels from the CENTRE (x right +, y down +). Safe area |x| < ${safe.x}, |y| < ${safe.y}.
LANGUAGE: ${ar ? 'Arabic (right-to-left). Use Arabic fonts: Cairo, Tajawal, Almarai, Changa, El Messiri, Reem Kufi, Lalezar, Amiri, Noto Kufi Arabic.' : 'English (or the language of my idea).'}
${o.assets?.length ? `MY FILES (use "type":"asset","name":… for real pictures): ${o.assets.join(', ')}\n` : ''}
HOW TO DESIGN:
1. Plan BEATS (one idea each, 2.5–4 s). Every beat a DIFFERENT composition: big kinetic headline · UI widget (window, phone, chat, typing + cursor) · data (chart-line, bars, donut, stat) · cards / chips / checklist · steps · bento · compare · quote · logo reveal.
2. Show, don't tell: build the idea with widgets and shapes. Text = 2–7 words per line, max 2 lines on screen. Highlight the key word.
3. Nothing static: staggered entrances (0.08–0.2 s), counters count, lines draw on, a slow camera push on most beats (zoom 1 → 1.06).
4. Transitions — never the same twice in a row: camera whip / push / zoom-through, a burst / wipe / slices / band-wipe widget (starts 0.5 s before the cut, in the next beat's colours), a reveal mask wipe, a match cut (the same shape carries into the next beat with keys). Change the background between beats.
5. Look hand-made: no random glow everywhere, no crossfades, no tiny decorative text, no dead holds over ~1 s.
6. One palette (3–5 colours) for the whole sequence. End on a strong final beat.
7. Spacing: a clear grid per beat, 40 px between blocks, texts never overlap each other or sit half on a card.

RECIPE FORMAT: { "autoStudioRecipe": 1, "palette": "dark" | { "bg":"#hex","card":"#hex","text":"#hex","muted":"#hex","accents":["#hex","#hex","#hex"],"font":"Montserrat" }, "items": [ … ] }
Palettes: ${Object.keys(PALETTES).join(', ')}. "start" = seconds (≥ 0), "dur" = seconds. Items listed first are BEHIND later ones.

ITEM TYPES:
• background — {"type":"background","kind":${BG_KINDS.map((k) => `"${k}"`).join('|')},"colors":["#hex",…],"start","dur"}
• text — {"type":"text","text","start","dur","x","y","size","font","weight","color","in","out","loop","align","width","lineHeight","spacing","upper","italic","gradient":["#c1","#c2"],"stroke":{"color","width"},"glow":"#hex","shadow":false,"highlight":[{"word","style":"marker"|"underline"|"circle"|"box"|"strike"|"color","bg","color","gradient":["#c1","#c2"],"at":0.8}]}
• shape — {"type":"shape","shape":"rect"|"roundrect"|"ellipse"|"ring"|"frame"|"line"|"triangle"|"star"|"polygon"|"path","w","h","radius","color","color2","x","y","rotation","fill":false,"lineWidth","dash":[12,10],"draw":0.8 (outline draws on),"strokeChase":true,"glow","shadow","d":"SVG path","viewBox":[vw,vh]}
• svg — {"type":"svg","svg":"<svg viewBox='0 0 400 300'>…</svg>","x","y","w","h","start","dur","in"} (flat vector drawing; single quotes inside; no text, no external images)
• icon — {"type":"icon","name","style":"line"|"gradient"|"neon"|"badge"|"squircle"|"glass","color","size","x","y","start","dur","in","loop"}
• widget — {"type":"widget","id":"…","start","dur","x","y","scale","color", …fields}. Widgets:
${Object.entries(WIDGETS).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}
• placeholder — {"type":"placeholder","kind":"person"|"photo"|"product"|"logo"|"screen","label","w","h","x","y","start","dur"} (a picture I replace)
• light — {"type":"light","id":${LIGHTS.map((k) => `"${k}"`).join('|')},"start","dur"}
• camera — {"type":"camera","start","dur","shake":0,"keys":[{"t":0,"zoom":1.12,"x":0,"y":0},{"t":1.5,"zoom":1,"x":0,"y":0,"ease":"fast-slow"}]} (every layer in its time follows it; zoom ≥ 1)
ANY item may also have "keys":[{"t","x","y","scale","rotation","opacity","blur","ease"}] (t from the item start; absolute values; eases: ease, ease-in, ease-out, linear, strong, fast-slow, overshoot, bounce, spring, hold), "reveal":"right"|"left"|"up"|"down"|"center" (+ "revealAt","revealDur"), "opacity", "rotation".

NAMES (use ONLY these):
- fonts: ${MOTION_FONTS.join(', ')}
- text "in": ${TEXT_INS.join(', ')} · "out": ${TEXT_OUTS.join(', ')} · "loop": ${LOOPS.join(', ')}
- other items "in": ${ITEM_INS.join(', ')}
- icons: ${icons}
- colours: #hex

OUTPUT: ONE JSON object only. Valid JSON: straight double quotes, no trailing commas, numbers without units, every "start" ≥ 0, everything inside the safe area, up to 80 items. A complete JSON is better than a long one that is cut.`;
}
