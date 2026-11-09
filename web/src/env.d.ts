/** App version from package.json (injected by Vite). */
declare const __APP_VERSION__: string;

/** Bridge exposed by the desktop app's preload script (absent in the browser). */
interface Window {
  autostudio?: {
    hardware: () => Promise<{ ramGB: number; cores: number; cpu: string; gpu: string; platform: string }>;
    /** YouTube search suggestions (fetched by the main process — no CORS, no quota). */
    suggest?: (q: string, lang: string) => Promise<string[]>;
    /** Download media from hosts that block cross-site requests (images / video / audio only, size-capped). */
    fetchMedia?: (url: string) => Promise<{ type: string; data: ArrayBuffer }>;
    /** Forget cached DNS answers (a new tunnel address may have been cached as "not found"). */
    flushDns?: () => Promise<void>;
    /** Local voice engine (Chatterbox on this PC). */
    voice?: {
      status: () => Promise<VoiceEngineStatus>;
      install: () => Promise<VoiceEngineStatus>;
      cancelInstall: () => Promise<boolean>;
      generate: (o: { id?: string; text: string; language?: string; voice?: ArrayBuffer; voiceExt?: string; exaggeration?: number; cfg?: number; temperature?: number; seed?: number; pause?: number }) => Promise<ArrayBuffer>;
      convert?: (o: { audio: ArrayBuffer; voice: ArrayBuffer; voiceExt?: string }) => Promise<ArrayBuffer>;
      separate?: (o: { audio: ArrayBuffer }) => Promise<{ vocals: ArrayBuffer; background: ArrayBuffer }>;
      cancel: () => Promise<boolean>;
      uninstall: () => Promise<VoiceEngineStatus>;
      logs: () => Promise<string[]>;
      onProgress: (cb: (p: { id?: string; stage: string; pct: number; line?: string; chunk?: number; chunks?: number }) => void) => () => void;
    };
    /** In-app updates from GitHub Releases (installer verified by SHA-256). */
    updates?: {
      check: () => Promise<UpdateInfo>;
      download: () => Promise<{ ok: boolean; version: string }>;
      install: () => Promise<{ ok: boolean; portable?: boolean }>;
      onProgress: (cb: (p: { received: number; total: number }) => void) => () => void;
    };
    /** Google sign-in (loopback OAuth with PKCE; tokens encrypted on disk by the main process). */
    google?: {
      signIn: (o: { clientId: string; clientSecret: string; scopes: string[] }) => Promise<{ ok: boolean; error?: string }>;
      token: () => Promise<string | null>;
      status: () => Promise<{ signedIn: boolean; scopes: string[] }>;
      signOut: () => Promise<void>;
    };
  };
}

interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  portable: boolean;
  notes: string;
  page: string;
  size: number;
  downloaded: boolean;
}

interface VoiceEngineStatus {
  supported: boolean;
  installed: boolean;
  model: boolean;
  installing: boolean;
  running: boolean;
  freeGB: number;
  sizeGB: number;
  needGB: number;
}
