import { create } from 'zustand';

export type Profile = 'low' | 'medium' | 'high';

export interface HardwareInfo {
  ramGB: number;
  cores: number;
  cpu: string;
  gpu: string;
  webgpu: boolean;
  source: 'desktop' | 'browser';
}

/** What each profile tunes. Export quality is never reduced — only preview and caches. */
export const PROFILE_SETTINGS: Record<Profile, { preview: number; lru: number; maxDim: number; heavyAiWarning: boolean }> = {
  low: { preview: 854, lru: 12, maxDim: 1280, heavyAiWarning: true },
  medium: { preview: 1280, lru: 30, maxDim: 1920, heavyAiWarning: false },
  high: { preview: 1600, lru: 60, maxDim: 2560, heavyAiWarning: false },
};

export const PROFILE_LABELS: Record<Profile, string> = { low: 'Low (light PCs)', medium: 'Medium', high: 'High (strong GPU)' };

const DISCRETE_GPU = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d/i;

/** Pick a profile from detected hardware. */
export function profileFor(h: HardwareInfo): Profile {
  if (h.ramGB <= 8 || h.cores <= 4 || !h.webgpu) return 'low';
  if (h.ramGB >= 16 && DISCRETE_GPU.test(h.gpu)) return 'high';
  return 'medium';
}

/** Desktop app: exact numbers from the preload bridge. Browser: best-effort estimates. */
export async function readHardware(): Promise<HardwareInfo> {
  const gpuApi = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> } }).gpu;
  const adapter = gpuApi ? await gpuApi.requestAdapter().catch(() => null) : null;
  const webgpu = !!adapter;
  const adapterName = adapter?.info ? [adapter.info.vendor, adapter.info.architecture, adapter.info.description].filter(Boolean).join(' ') : '';
  if (window.autostudio?.hardware) {
    try {
      const h = await window.autostudio.hardware();
      return { ramGB: h.ramGB, cores: h.cores, cpu: h.cpu, gpu: h.gpu || adapterName, webgpu, source: 'desktop' };
    } catch {
      /* fall through to browser estimates */
    }
  }
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return { ramGB: mem ?? 8, cores: navigator.hardwareConcurrency || 4, cpu: '', gpu: adapterName || 'unknown', webgpu, source: 'browser' };
}

interface PerfState {
  hw?: HardwareInfo;
  detected: Profile;
  override: Profile | null;
  profile: Profile;
  init: () => Promise<void>;
  setOverride: (p: Profile | null) => void;
}

const savedOverride = (globalThis.localStorage?.getItem('perfProfile') as Profile | null) ?? null;

export const usePerf = create<PerfState>((set, get) => ({
  detected: 'medium',
  override: savedOverride,
  profile: savedOverride ?? 'medium',
  init: async () => {
    const hw = await readHardware();
    const detected = profileFor(hw);
    set({ hw, detected, profile: get().override ?? detected });
  },
  setOverride: (p) => {
    if (p) localStorage.setItem('perfProfile', p);
    else localStorage.removeItem('perfProfile');
    set({ override: p, profile: p ?? get().detected });
  },
}));

export const perfSettings = () => PROFILE_SETTINGS[usePerf.getState().profile];

let heavyOk = false;
/** On the Low profile, ask once per session before running in-browser AI models (depth, object selection). */
export function confirmHeavyAi(): boolean {
  if (heavyOk || !perfSettings().heavyAiWarning) return true;
  heavyOk = window.confirm('This PC is on the Low performance profile. 3D depth and object selection download ~90 MB of AI models once and can take a minute or two (they run on the CPU if the graphics card cannot). Continue?');
  return heavyOk;
}
