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

const saved = JSON.parse(globalThis.localStorage?.getItem('llm') ?? '{}');

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
export async function chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {}): Promise<string> {
  const { preset, url, key, model, status } = useLlm.getState();
  if (status !== 'ready' && !(await useLlm.getState().check())) throw new Error('AI assistant is not connected. Click "Connect LLM" in the top bar.');
  if (preset === 'colab') {
    const f = new FormData();
    f.append('messages', JSON.stringify(messages));
    f.append('max_tokens', String(opts.maxTokens ?? 600));
    f.append('temperature', String(opts.temperature ?? 0.6));
    const j = await runJob('chat', f, () => {});
    return cleanReply(String(j.data.reply ?? ''));
  }
  // Some chat templates (e.g. Gemma) reject a system role — fold it into the first user turn.
  const msgs = /gemma/i.test(model) ? foldSystem(messages) : messages;
  let r: Response;
  try {
    r = await fetch(`${url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: msgs, temperature: opts.temperature ?? 0.6, max_tokens: opts.maxTokens ?? 600, stream: false }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError') throw new Error('The AI assistant took too long to answer. Try a smaller model or try again.');
    throw new Error(`Cannot reach the AI assistant at ${url}. Is the server running, and is CORS enabled (LM Studio → Developer → Settings → Enable CORS)?`);
  }
  if (!r.ok) throw new Error(`LLM error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = cleanReply(String(j.choices?.[0]?.message?.content ?? ''));
  if (!text) throw new Error('The model returned an empty answer (thinking models may need a higher token limit, or a non-thinking model).');
  return text;
}

/** Strip reasoning blocks (closed or cut off) that thinking models put before the answer. */
export function cleanReply(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*<think>[\s\S]*$/, '').trim();
}

function foldSystem(m: ChatMessage[]): ChatMessage[] {
  const sys = m.filter((x) => x.role === 'system').map((x) => x.content).join('\n');
  const rest = m.filter((x) => x.role !== 'system');
  if (!sys || !rest.length) return rest;
  return [{ ...rest[0], content: `${sys}\n\n${rest[0].content}` }, ...rest.slice(1)];
}

/**
 * Find and parse JSON in a model reply: handles ```json fences, prose before/after, and trailing commas.
 * Scans for the first balanced {…} or […] that parses.
 */
export function parseJsonLoose<T>(reply: string): T {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : reply;
  const tryParse = (x: string) => {
    try {
      return { ok: true as const, v: JSON.parse(x.replace(/,\s*([\]}])/g, '$1')) };
    } catch {
      return { ok: false as const };
    }
  };
  const whole = tryParse(text.trim());
  if (whole.ok) return whole.v as T;
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== '{' && open !== '[') continue;
    let depth = 0, inStr = false, esc = false;
    for (let k = i; k < text.length; k++) {
      const c = text[k];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) {
          const r = tryParse(text.slice(i, k + 1));
          if (r.ok) return r.v as T;
          break;
        }
      }
    }
  }
  throw new Error('The AI assistant did not return valid JSON. Try again, or use a larger model.');
}

/** Ask for JSON and parse it; retries once with a reminder when the first reply is not valid JSON. */
export async function chatJson<T>(system: string, user: string, maxTokens = 1200): Promise<T> {
  const messages: ChatMessage[] = [{ role: 'system', content: `${system}\nReply with valid JSON only, no commentary.` }, { role: 'user', content: user }];
  const reply = await chat(messages, { maxTokens, temperature: 0.3 });
  try {
    return parseJsonLoose<T>(reply);
  } catch {
    const again = await chat([...messages, { role: 'assistant', content: reply }, { role: 'user', content: 'That was not valid JSON. Reply again with only the JSON, nothing else.' }], { maxTokens, temperature: 0.1 });
    return parseJsonLoose<T>(again);
  }
}
