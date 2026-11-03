/**
 * Adapter for the TryAIToday Studio Colab notebook (github.com/codewithsiddique-04/tryaitoday-studio-notebook).
 *
 * Their API: POST /chatterbox/start | /whisper/start | /upscaler/start | /vupscaler/start → { job_id },
 * progress events over WebSocket /ws/{job_id} ({ type: 'log' | 'status' | 'image', message, status }),
 * results at GET /file/{job_id}/{key} (audio, words, segments, img0…, zip, output), POST /cancel/{job_id}.
 * Their Chatterbox is the English "Turbo" model and always clones a reference voice.
 */
import type { EngineTool, JobState } from './engine';

/** Our tool → their runner name (used to read /api/health). */
export const TRYAI_TOOLS: Partial<Record<EngineTool, string>> = { tts: 'chatterbox', transcribe: 'whisper', upscale: 'upscaler', video_upscale: 'vupscaler' };

const NEEDS_AUTOSTUDIO: Partial<Record<EngineTool, string>> = {
  imagegen: 'AI images', prompts: 'prompt writing', script: 'script writing', chat: 'the AI assistant', videogen: 'AI video',
};

/** Build their request for one of our tools. Throws a friendly error when the feature does not exist there. */
export function tryAiRequest(tool: EngineTool, form: FormData): { path: string; body: FormData; result: (id: string) => string[] } {
  const body = new FormData();
  const file = form.get('file') as File | null;
  if (tool === 'tts') {
    const voice = form.get('voice') as File | null;
    const lang = String(form.get('language') ?? 'en');
    if (!voice) throw new Error('The TryAIToday engine always clones a voice — add a reference voice sample (5–15 s), or use the AutoStudio engine for preset voices.');
    if (lang && lang !== 'en') throw new Error('The TryAIToday engine speaks English only (Chatterbox Turbo). Use the AutoStudio engine for the other 22 languages.');
    body.append('mode', 'single');
    body.append('script', new File([String(form.get('text') ?? '')], 'script.txt', { type: 'text/plain' }));
    body.append('ref_audio', voice, voice.name || 'voice.wav');
    body.append('temperature', String(Math.min(2, Math.max(0.1, +(form.get('temperature') ?? 0.8) || 0.8))));
    body.append('pause', '0.5');
    body.append('max_chars', '200');
    return { path: '/chatterbox/start', body, result: (id) => [`/file/${id}/audio`] };
  }
  if (tool === 'transcribe') {
    if (!file) throw new Error('No audio to transcribe');
    const lang = String(form.get('language') ?? 'auto');
    body.append('file', file, file.name || 'voiceover.wav');
    body.append('language', !lang || lang === 'auto' ? 'auto' : lang);
    return { path: '/whisper/start', body, result: (id) => [`/file/${id}/words`] };
  }
  if (tool === 'upscale' || tool === 'video_upscale') {
    if (!file) throw new Error('No file to upscale');
    const scale = +(form.get('scale') ?? 2) >= 4 ? '4' : '2';
    body.append('files', file, file.name || (tool === 'upscale' ? 'image.png' : 'video.mp4'));
    body.append('scale', tool === 'upscale' ? scale : '2');
    return tool === 'upscale'
      ? { path: '/upscaler/start', body, result: (id) => [`/file/${id}/img0`] }
      : { path: '/vupscaler/start', body, result: (id) => [`/file/${id}/output`] };
  }
  throw new Error(`The TryAIToday engine has no ${NEEDS_AUTOSTUDIO[tool] ?? tool}. Connect the AutoStudio engine for this.`);
}

/** Their Whisper word list → our words. */
export const mapWords = (raw: { word?: string; text?: string; start: number; end: number }[]) =>
  raw.map((w) => ({ text: String(w.word ?? w.text ?? '').trim(), start: +w.start, end: +w.end })).filter((w) => w.text);

export async function runTryAiJob(url: string, tool: EngineTool, form: FormData, onUpdate: (j: JobState) => void, signal?: AbortSignal): Promise<JobState> {
  const req = tryAiRequest(tool, form);
  const r = await fetch(`${url}${req.path}`, { method: 'POST', body: req.body, signal });
  const start = await r.json().catch(() => ({}));
  if (!r.ok || !start.job_id) throw new Error(`TryAIToday engine: ${start.error ?? `error ${r.status}`}`);
  const id: string = start.job_id;
  const state: JobState = { id, status: 'running', progress: 0, logs: [`Started ${req.path.split('/')[1]} job ${id}`], files: [] };

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/ws/${id}`);
    let finished = false;
    const done = (err?: Error) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      ws.close();
      err ? reject(err) : resolve();
    };
    const abort = () => {
      void fetch(`${url}/cancel/${id}`, { method: 'POST' }).catch(() => {});
      done(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort);
    ws.onmessage = (ev) => {
      const e = JSON.parse(String(ev.data)) as { type: string; message?: string; status?: string };
      if (e.message) state.logs = [...state.logs, e.message].slice(-400);
      const pct = e.message?.match(/(\d{1,3}(?:\.\d+)?)\s?%/);
      if (pct) state.progress = Math.min(0.99, +pct[1] / 100);
      onUpdate({ ...state });
      if (e.type === 'status' && e.status === 'completed') done();
      else if (e.type === 'status' && e.status === 'failed') done(new Error(e.message || 'Job failed'));
    };
    ws.onerror = () => done(new Error('Lost the connection to the TryAIToday engine (WebSocket).'));
    ws.onclose = () => done(new Error('The TryAIToday engine closed the connection before the job finished.'));
  });

  const files = req.result(id);
  if (tool === 'transcribe') {
    const words = mapWords(await (await fetch(`${url}${files[0]}`)).json());
    return { ...state, status: 'done', progress: 1, data: { words, language: String(form.get('language') ?? 'auto') } };
  }
  const name = (form.get('file') as File | null)?.name?.replace(/\.[^.]+$/, '') ?? 'output';
  const ext = tool === 'tts' ? 'wav' : tool === 'upscale' ? 'png' : 'mp4';
  const label = tool === 'tts' ? 'voiceover' : `${name}_upscaled`;
  return { ...state, status: 'done', progress: 1, files: files.map((u) => ({ name: `${label}.${ext}`, url: u })) };
}
