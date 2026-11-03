/** App version from package.json (injected by Vite). */
declare const __APP_VERSION__: string;

/** Bridge exposed by the desktop app's preload script (absent in the browser). */
interface Window {
  autostudio?: {
    hardware: () => Promise<{ ramGB: number; cores: number; cpu: string; gpu: string; platform: string }>;
  };
}
