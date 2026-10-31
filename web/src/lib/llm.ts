import { create } from 'zustand';
import { runJob, useEngine } from './engine';

export type LlmPreset = 'lmstudio' | 'ollama' | 'colab' | 'custom';

export const PRESETS: Record<LlmPreset, { label: string; url: string; help: string }> = {
  lmstudio: { label: 'LM Studio', url: 'http://localhost:1234/v1', help: 'LM Studio → Developer → start the server, load a model (e.g. Gemma) and turn on "Enable CORS" in server settings.' },
  ollama: { label: 'Ollama', url: 'http://localhost:11434/v1', help: 'Install Ollama, run `ollama pull qwen2.5:7b`, and start it with OLLAMA_ORIGINS=* so the browser may call it.' },
  colab: { label: 'Colab engine (Qwen2.5)', url: '', help: 'Uses the Qwen2.5-3B model inside your Colab engine. Connect the engine first.' },
  custom: { label: 'Custom (OpenAI-compatible)', url: 'http://localhost:8080/v1', help: 'Any server speaking the OpenAI /v1/chat/completions API (llama.cpp, vLLM, Jan, OpenRouter…).' },
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmState {
  preset: LlmPreset;
  url: string;
  key: string;
  model: string;
  models: string[];
  status: 'offline' | 'checking' | 'ready';
  error?: string;
  set: (p: Partial<Pick<LlmState, 'preset' | 'url' | 'key' | 'model'>>) => void;
  check: () => Promise<boolean>;
}

const saved = JSON.parse(localStorage.getItem('llm') ?? '{}');

export const useLlm = create<LlmState>((set, get) => ({
  preset: saved.preset ?? 'lmstudio',
  url: saved.url ?? PRESETS.lmstudio.url,
  key: saved.key ?? '',
  model: saved.model ?? '',
  models: [],
  status: 'offline',
  set: (p) => {
    set(p);
    const { preset, url, key, model } = get();
    localStorage.setItem('llm', JSON.stringify({ preset, url, key, model }));
  },
  check: async () => {
    const { preset, url, key } = get();
    set({ status: 'checking', error: undefined });
    try {
      if (preset === 'colab') {
        const ok = useEngine.getState().status === 'ready' || (await useEngine.getState().check());
        set({ status: ok ? 'ready' : 'offline', models: ['Qwen2.5-3B-Instruct'], error: ok ? undefined : 'Colab engine is not connected.' });
        return ok;
      }
      const r = await fetch(`${url.replace(/\/+$/, '')}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      const models: string[] = (j.data ?? j.models ?? []).map((m: any) => m.id ?? m.name).filter(Boolean);
      set({ status: 'ready', models, model: get().model && models.includes(get().model) ? get().model : models[0] ?? '' });
      get().set({});
      return true;
    } catch (e) {
      set({ status: 'offline', error: `Cannot reach ${url} — is the server running with CORS enabled? (${(e as Error).message})` });
      return false;
    }
  },
}));

/** Send a chat to the configured LLM and return the reply text. */
export async function chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const { preset, url, key, model, status } = useLlm.getState();
  if (status !== 'ready' && !(await useLlm.getState().check())) throw new Error('AI assistant is not connected. Click "Connect LLM" in the top bar.');
  if (preset === 'colab') {
    const f = new FormData();
    f.append('messages', JSON.stringify(messages));
    f.append('max_tokens', String(opts.maxTokens ?? 600));
    f.append('temperature', String(opts.temperature ?? 0.6));
    const j = await runJob('chat', f, () => {});
    return j.data.reply as string;
  }
  // Some chat templates (e.g. Gemma) reject a system role — fold it into the first user turn.
  const msgs = /gemma/i.test(model) ? foldSystem(messages) : messages;
  const r = await fetch(`${url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, messages: msgs, temperature: opts.temperature ?? 0.6, max_tokens: opts.maxTokens ?? 600, stream: false }),
  });
  if (!r.ok) throw new Error(`LLM error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function foldSystem(m: ChatMessage[]): ChatMessage[] {
  const sys = m.filter((x) => x.role === 'system').map((x) => x.content).join('\n');
  const rest = m.filter((x) => x.role !== 'system');
  if (!sys || !rest.length) return rest;
  return [{ ...rest[0], content: `${sys}\n\n${rest[0].content}` }, ...rest.slice(1)];
}

/** Ask for JSON and parse the first JSON object/array in the reply. */
export async function chatJson<T>(system: string, user: string, maxTokens = 1200): Promise<T> {
  const reply = await chat([{ role: 'system', content: `${system}\nReply with valid JSON only, no commentary.` }, { role: 'user', content: user }], { maxTokens, temperature: 0.3 });
  const m = reply.match(/[[{][\s\S]*[\]}]/);
  if (!m) throw new Error('The LLM did not return JSON.');
  return JSON.parse(m[0]) as T;
}
