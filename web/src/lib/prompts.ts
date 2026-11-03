/**
 * Prompt Studio: ready-made, editable prompts for jobs that need a stronger AI than the local assistant.
 * The app fills them with project data, then copies them and opens Claude / ChatGPT / Gemini / Google Flow.
 */
import { fmtTime } from './util';
import { splitScenes } from './scenes';
import type { Project } from '../types';

export type Target = 'claude' | 'chatgpt' | 'gemini' | 'flow';

/** Claude and ChatGPT accept `?q=` to pre-fill the chat box; Gemini and Flow get the prompt via the clipboard. */
export const TARGETS: Record<Target, { label: string; url: (q: string) => string; prefill: boolean }> = {
  claude: { label: 'Claude', url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, prefill: true },
  chatgpt: { label: 'ChatGPT', url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, prefill: true },
  gemini: { label: 'Gemini', url: () => 'https://gemini.google.com/app', prefill: false },
  flow: { label: 'Google Flow', url: () => 'https://labs.google/fx/tools/flow', prefill: false },
};
/** Longer prompts are only copied (very long links get cut off). */
export const PREFILL_LIMIT = 6000;

export interface PromptTemplate {
  id: string;
  name: string;
  category: 'Script' | 'Visuals' | 'Growth';
  description: string;
  targets: Target[];
  body: string;
  /** True for templates the user made. */
  custom?: boolean;
}

export const VARIABLES: { key: string; label: string; hint: string; fromProject?: boolean; multiline?: boolean; optional?: boolean }[] = [
  { key: 'topic', label: 'Topic', hint: 'e.g. why discipline beats motivation' },
  { key: 'niche', label: 'Niche', hint: 'e.g. self-improvement, history, finance' },
  { key: 'audience', label: 'Audience', hint: 'e.g. students 18–25' },
  { key: 'language', label: 'Language', hint: 'English' },
  { key: 'tone', label: 'Tone', hint: 'calm, cinematic, motivational' },
  { key: 'length', label: 'Length (minutes)', hint: '8' },
  { key: 'style', label: 'Visual style', hint: 'cinematic photo, dramatic lighting' },
  { key: 'character', label: 'Recurring character', hint: 'optional — described the same way every time', optional: true },
  { key: 'aspect', label: 'Aspect ratio', hint: '16:9', fromProject: true },
  { key: 'title', label: 'Video title', hint: 'project name', fromProject: true },
  { key: 'duration', label: 'Video length', hint: 'from the project', fromProject: true },
  { key: 'transcript', label: 'Transcript', hint: 'from the project captions', fromProject: true, multiline: true },
  { key: 'scenes', label: 'Scenes', hint: 'narration split into scenes with times', fromProject: true, multiline: true },
];

export const BUILTIN_TEMPLATES: PromptTemplate[] = [
  {
    id: 'script', name: 'Faceless video script', category: 'Script', targets: ['claude', 'chatgpt', 'gemini'],
    description: 'A full narration script with a strong hook, ready for the AI Voiceover tool.',
    body: `You are an expert YouTube scriptwriter for faceless channels in the {{niche}} niche.
Write a {{length}}-minute voiceover script in {{language}} about: {{topic}}.
Audience: {{audience}}. Tone: {{tone}}.

Requirements:
- Open with a 10–15 second hook that creates curiosity (no "welcome to my channel").
- Short, spoken sentences (max ~18 words). Natural pauses with paragraph breaks.
- Pattern interrupts every 45–60 seconds (a question, a surprising fact, a mini-story).
- Concrete examples instead of generic advice; no filler.
- End with a satisfying payoff and a one-line call to action.
- Output ONLY the narration text (no headings, no stage directions, no emojis).`,
  },
  {
    id: 'hook', name: 'Rewrite the hook', category: 'Script', targets: ['claude', 'chatgpt'],
    description: 'Five stronger openings for the first 15 seconds of this video.',
    body: `Here is the transcript of my faceless YouTube video "{{title}}":

{{transcript}}

Write 5 alternative hooks (max 40 words each) for the first 15 seconds. Each should use a different technique: bold claim, question, mini-story, surprising statistic, "you" scenario. Keep the same language as the transcript. Then tell me which one you would pick and why (one sentence).`,
  },
  {
    id: 'flow-images', name: 'Scene image prompts (Google Flow)', category: 'Visuals', targets: ['gemini', 'claude', 'chatgpt'],
    description: 'One image prompt per scene, in the Flow Automator format (prompts separated by a blank line).',
    body: `Write one image-generation prompt for each scene below, for Google Flow (Imagen).
Visual style: {{style}}. Aspect ratio: {{aspect}}.
{{character}}

Rules:
- One prompt per scene, in the same order, max 60 words each: subject, action, setting, lighting, camera angle, mood.
- Keep characters, clothing and locations consistent between scenes.
- No text, letters, logos or watermarks in the image. No real people's names.
- Output ONLY the prompts, separated by ONE blank line, no numbering.

Scenes:
{{scenes}}`,
  },
  {
    id: 'veo', name: 'AI video prompts (Veo / Flow)', category: 'Visuals', targets: ['gemini', 'flow'],
    description: 'Short motion prompts for the key moments, for Veo in Google Flow.',
    body: `From the scenes below, pick the 5 most visual moments and write a Veo video prompt for each (max 70 words):
camera movement, subject motion, environment, lighting, pacing, and mood. Style: {{style}}. Aspect ratio: {{aspect}}.
No dialogue, no on-screen text. Put the scene time in brackets before each prompt, e.g. [00:42].

{{scenes}}`,
  },
  {
    id: 'thumbnail', name: 'Thumbnail concepts', category: 'Growth', targets: ['gemini', 'chatgpt', 'claude'],
    description: 'Three click-worthy thumbnail ideas with text and an image prompt for each.',
    body: `I make faceless YouTube videos in the {{niche}} niche. Video title: "{{title}}".
Summary of the video:
{{transcript}}

Give me 3 thumbnail concepts. For each: the main visual (one focal subject), the emotion, 2–4 words of thumbnail text, colours and composition (rule of thirds, contrast), and a ready-to-use image prompt (16:9, no text in the image — I add the text myself). Explain in one line why each would get clicks.`,
  },
  {
    id: 'seo', name: 'Titles, description & tags', category: 'Growth', targets: ['claude', 'chatgpt', 'gemini'],
    description: 'SEO package for upload: titles, description with chapters, tags and hashtags.',
    body: `Act as a YouTube SEO expert. Here is my video's transcript (video length {{duration}}, language {{language}}):

{{transcript}}

Give me:
1. 10 title options (max 60 characters, curiosity + main keyword early), and mark your top 3.
2. A description: 2-sentence hook, a 150-word summary using natural keywords, then chapters with timestamps (use the transcript's flow; start at 00:00).
3. 20 tags (mix of broad and long-tail).
4. 5 hashtags.
5. The 3 main search keywords this video should rank for.`,
  },
  {
    id: 'shorts', name: 'Repurpose into Shorts', category: 'Growth', targets: ['claude', 'chatgpt'],
    description: 'Three 30–45 s Shorts scripts cut from this video, with hooks.',
    body: `Here is the transcript of my long video "{{title}}":

{{transcript}}

Create 3 YouTube Shorts scripts (30–45 seconds each, {{language}}) from the strongest moments. Each must start with a 1-sentence hook in the first 2 seconds, keep sentences very short, and end with a loop line that leads back into the start. Add a suggested title for each.`,
  },
  {
    id: 'strategy', name: 'Channel plan to monetization', category: 'Growth', targets: ['claude', 'chatgpt'],
    description: 'A 90-day plan for a faceless channel to reach the Partner Program.',
    body: `I run a new faceless YouTube channel in the {{niche}} niche for {{audience}}, in {{language}}. I make videos with AI voiceover and stock/AI visuals.

Make me a 90-day plan to reach YouTube Partner Program eligibility:
- 20 specific video ideas ranked by search demand vs competition, each with a working title.
- Upload schedule (long videos + Shorts) and how to batch-produce them.
- How to keep the content original enough for monetization review (avoid "reused" / "inauthentic" content), including what to change per video.
- Thumbnail and title rules for this niche.
- What metrics to watch each week (CTR, average view duration, returning viewers) and what to do when they are low.`,
  },
  {
    id: 'character', name: 'Consistent character sheet', category: 'Visuals', targets: ['gemini', 'chatgpt'],
    description: 'A reusable description so the same character looks identical in every AI image.',
    body: `Create a detailed, reusable character description for AI image generation, for a recurring character in my {{niche}} videos ({{style}} style).
Starting idea: {{character}}
Give: one 60-word "character prompt" block I can paste into every image prompt (face, age, hair, clothing, colours, distinctive features), 5 example scene prompts using it, and tips to keep it consistent in Google Flow.`,
  },
];

/** Values that come from the open project. */
export function projectVariables(p: Project | undefined): Record<string, string> {
  if (!p) return {};
  const words = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const transcript = words.map((w) => w.text).join(' ');
  const scenes = splitScenes(words, 6).map((s, i) => `${i + 1}. [${fmtTime(s.start, false)}] ${s.text}`).join('\n');
  const last = words[words.length - 1]?.end ?? p.length;
  return { title: p.name, transcript, scenes, aspect: p.export.aspect, duration: fmtTime(last, false) };
}

/** Replace {{key}} with values; empty values become a visible [key] placeholder (lines that are only a placeholder are dropped). */
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body
    .split('\n')
    .filter((line) => !(/^\s*\{\{(\w+)\}\}\s*$/.test(line) && !vars[line.trim().slice(2, -2)]?.trim()))
    .join('\n')
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k]?.trim() || `[${k}]`);
}

/** Templates with the user's edits applied (stored in localStorage). */
const KEY = 'promptTemplates';
export function loadTemplates(): PromptTemplate[] {
  const saved: { edits?: Record<string, string>; custom?: PromptTemplate[] } = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
  return [...BUILTIN_TEMPLATES.map((t) => ({ ...t, body: saved.edits?.[t.id] ?? t.body })), ...(saved.custom ?? [])];
}
export function saveTemplates(list: PromptTemplate[]) {
  const edits: Record<string, string> = {};
  for (const t of list) {
    const b = BUILTIN_TEMPLATES.find((x) => x.id === t.id);
    if (b && b.body !== t.body) edits[t.id] = t.body;
  }
  localStorage.setItem(KEY, JSON.stringify({ edits, custom: list.filter((t) => t.custom) }));
}
export const isEdited = (t: PromptTemplate) => {
  const b = BUILTIN_TEMPLATES.find((x) => x.id === t.id);
  return !!b && b.body !== t.body;
};
