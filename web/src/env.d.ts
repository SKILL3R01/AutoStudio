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
    /** Google sign-in (loopback OAuth with PKCE; tokens encrypted on disk by the main process). */
    google?: {
      signIn: (o: { clientId: string; clientSecret: string; scopes: string[] }) => Promise<{ ok: boolean; error?: string }>;
      token: () => Promise<string | null>;
      status: () => Promise<{ signedIn: boolean; scopes: string[] }>;
      signOut: () => Promise<void>;
    };
  };
}
