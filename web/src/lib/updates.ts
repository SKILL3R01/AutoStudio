/** In-app updates (desktop app only): check → download (verified) → restart & install. */
import { create } from 'zustand';

type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'uptodate' | 'error';

interface UpdateState {
  phase: Phase;
  info?: UpdateInfo;
  progress: number;
  error?: string;
  auto: boolean;
  setAuto: (v: boolean) => void;
  check: (silent?: boolean) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

const api = () => window.autostudio?.updates;
export const updatesSupported = () => !!api();

export const useUpdates = create<UpdateState>((set, get) => ({
  phase: 'idle',
  progress: 0,
  auto: globalThis.localStorage?.getItem('autoUpdateCheck') !== '0',
  setAuto: (v) => (localStorage.setItem('autoUpdateCheck', v ? '1' : '0'), set({ auto: v })),
  check: async (silent = false) => {
    if (!api()) return;
    set({ phase: 'checking', error: undefined });
    try {
      const info = await api()!.check();
      localStorage.setItem('lastUpdateCheck', String(Date.now()));
      set({ info, phase: info.available ? (info.downloaded ? 'ready' : 'available') : 'uptodate' });
    } catch (e) {
      set({ phase: silent ? 'idle' : 'error', error: (e as Error).message });
    }
  },
  download: async () => {
    if (!api()) return;
    set({ phase: 'downloading', progress: 0, error: undefined });
    const off = api()!.onProgress((p) => set({ progress: p.total ? p.received / p.total : 0 }));
    try {
      await api()!.download();
      set({ phase: 'ready', progress: 1 });
    } catch (e) {
      set({ phase: 'error', error: (e as Error).message });
    } finally {
      off();
    }
  },
  install: async () => {
    if (!api()) return;
    set({ phase: 'installing' });
    const r = await api()!.install().catch((e: Error) => (set({ phase: 'error', error: e.message }), null));
    if (r?.portable) set({ phase: 'available' });
    void get;
  },
}));

/** Quietly look for a new version at most once a day (when enabled). */
export function autoCheckUpdates() {
  const s = useUpdates.getState();
  if (!api() || !s.auto) return;
  const last = +(localStorage.getItem('lastUpdateCheck') ?? 0);
  if (Date.now() - last < 20 * 3600_000) return;
  setTimeout(() => void useUpdates.getState().check(true), 8000);
}
