/** Story prompts for Claude / ChatGPT / Gemini (copy-paste) and the local assistant: the AI picks a designed scene and fills it. */
import type { Project } from '../../types';
import { getKit, variantOf } from '../styles';
import type { StoryState } from './model';

/** Scenes per message (one answer stays short: ~60 tokens per scene). */
export const PART_SIZE = 48;
export const partsOf = (st: StoryState) => {
  const out: { i: number; from: number; to: number }[] = [];
  for (let a = 0; a < st.scenes.length; a += PART_SIZE) out.push({ i: out.length, from: a, to: Math.min(st.scenes.length, a + PART_SIZE) });
  return out;
};

const fmt = (t: number) => t.toFixed(1);
const catalogue = (st: StoryState) => getKit(st.styleId).templates.filter((t) => !t.fits.includes('chapter')).map((t) => `- ${t.id}: ${t.describe} · slots: ${t.slots.join(', ')} · good for: ${t.fits.join(', ')}`).join('\n');
const sceneLines = (st: StoryState, from: number, to: number) => st.scenes.slice(from, to).map((s, k) => `${from + k + 1} (${fmt(s.start)}–${fmt(s.end)} s) “${s.text}”${s.note ? ` [note: ${s.note}]` : ''}${s.locked ? ' [LOCKED — skip]' : ''} · suggested: ${s.templateId}`).join('\n');

/** The contract (sent once, in the first message of the chat). */
function contract(st: StoryState, p: Project) {
  const kit = getKit(st.styleId), v = variantOf(kit, st.variantId);
  const files = (p.assets ?? []).filter((a) => a.kind === 'image').slice(0, 40).map((a) => a.name);
  const ar = /[\u0600-\u06ff]/.test(st.script);
  return `TASK: you are the art director of my video editor AutoStudio. My video is cut into SCENES (one idea each, timed to my voice). For every scene I list, choose ONE scene design from the catalogue and fill its slots. Answer with ONE JSON object only — no explanation, no markdown fences, no comments:
{"autoStudioStory":1,"scenes":[{"n":1,"template":"<design id>","slots":{"title":"…","key":"…"}},{"n":2,"template":"…","slots":{…}}]}

STYLE: ${kit.name} (${v.name}). ${kit.direction}

RULES:
- One entry for EVERY scene number I list (skip LOCKED ones). Keep the scene numbers.
- Never the same design twice in a row, and at most twice in any 5 scenes. Use the scene's meaning: numbers → number designs, comparisons → compare designs, lists → list designs, questions → question designs, the first scene as a hook, the last as a strong ending.
- title: max 6 words taken from what is SAID in that scene (same language${ar ? ' — Arabic stays Arabic' : ''}). key: ONE word of the title that matters most (it gets highlighted when spoken).
- value: numbers exactly as said ("40%", "$2.4M", "3x"). items: max 4 short phrases (2–4 words). left / right: short phrases for the two sides.
- label / sub / date: short (max 4 words). icon: a simple English noun (heart, rocket, clock, money, phone…).
${files.length ? `- image / image2: the file name of one of MY PICTURES when it fits the scene: ${files.join(', ')}\n` : ''}- Do not invent facts that are not in the spoken words.

SCENE DESIGNS (catalogue):
${catalogue(st)}`;
}

/** First message (contract + part 1) and short follow-ups for the other parts (same chat). */
export function storyMessage(st: StoryState, p: Project, part: number): string {
  const parts = partsOf(st), pt = parts[part];
  if (!pt) return '';
  const head = part === 0 ? `${contract(st, p)}\n\n` : `PART ${part + 1} of ${parts.length} — same rules and catalogue as before.\n`;
  return `${head}SCENES ${pt.from + 1}–${pt.to}${parts.length > 1 ? ` (part ${part + 1} of ${parts.length})` : ''}:\n${sceneLines(st, pt.from, pt.to)}\n\nAnswer with ONE JSON object only.`;
}
/** Local assistant: no chat memory, so every part carries the contract. */
export const localStoryMessage = (st: StoryState, p: Project, part: number) => `${contract(st, p)}\n\n${storyMessage(st, p, part).replace(/^PART [^\n]*\n/, '')}`;

export const continueMessage = (missing: number[]) => `Your answer was cut off. Send ONLY the scenes that are missing (${missing.slice(0, 60).join(', ')}) as ONE JSON object in the same format.`;
export const resendMessage = (err: string) => `That was not valid JSON (${err}). Send the same answer again as ONE valid JSON object only, in the format {"autoStudioStory":1,"scenes":[…]}.`;
export function redoMessage(st: StoryState, nums: number[], how: 'stronger' | 'simpler' | 'different') {
  const ask = how === 'stronger' ? 'make them STRONGER: bolder designs (numbers, compares, photos, questions), punchier titles'
    : how === 'simpler' ? 'make them SIMPLER: calm designs (headline, highlighted sentence, one photo), short titles'
    : 'use DIFFERENT designs than your last answer for each of them';
  return `Redo scenes ${nums.join(', ')}: ${ask}. Same rules and format.\n${nums.map((n) => sceneLines(st, n - 1, n)).join('\n')}\nAnswer with ONE JSON object only.`;
}

/** The AI writes the narration script for an idea in the style's story shape. */
export function scriptMessage(idea: string, styleId: string, minutes: number, lang: 'auto' | 'en' | 'ar') {
  const kit = getKit(styleId);
  const ar = lang === 'ar' || (lang === 'auto' && /[\u0600-\u06ff]/.test(idea));
  return `Write the narration script for a ${minutes}-minute ${kit.name.toLowerCase()} video about:
${idea.trim()}

Shape: ${kit.storyShape}.
- About ${Math.round(minutes * 150)} words, spoken language, short sentences (one idea per sentence — every sentence becomes a scene).
- Put concrete numbers, comparisons and examples in the sentences (they become charts, counters and compare scenes).
- ${ar ? 'Write it in Arabic.' : 'Write it in the language of my idea.'}
Answer with the narration text ONLY: no title, no headings, no stage directions, no quotes around it.`;
}
