/** Inline stroke icons (24×24 grid, Lucide-style paths drawn by hand). */
const PATHS: Record<string, string> = {
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 18l-6-6 6-6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  media: 'M4 4h16v16H4zM4 15l4-4 5 5 3-3 4 4M15 9h.01',
  motion: 'M3 12h4l3-8 4 16 3-8h4',
  transition: 'M4 6h8v12H4zM12 6l8 6-8 6',
  captions: 'M3 6h18v12H3zM7 11h3M7 14h6M13 11h4M15 14h2',
  keywords: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z',
  sfx: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14',
  effects: 'M12 3l1.9 5.8L20 10l-5 3.8L16.5 20 12 16.6 7.5 20 9 13.8 4 10l6.1-1.2z',
  depth: 'M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M13.5 7.5L3 18l3 3L16.5 10.5M18 13l1.5 1.5M18 13l-1.5 1.5',
  ai: 'M9 3h6v4H9zM5 7h14v12H5zM9 12h.01M15 12h.01M9 16h6',
  export: 'M12 3v12M7 8l5-5 5 5M5 15v5h14v-5',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  paste: 'M8 3h8v4H8zM16 5h3v16H5V5h3',
  ripple: 'M3 12h6M15 12h6M12 4v16M6 9l3 3-3 3M18 9l-3 3 3 3',
  unlink: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1M4 4l16 16',
  magnet: 'M6 3v8a6 6 0 0012 0V3h-4v8a2 2 0 01-4 0V3zM6 7h4M14 7h4',
  scissors: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  split: 'M12 3v18M4 7h5v10H4zM15 7h5v10h-5z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  check: 'M5 12l5 5L20 7',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  x: 'M6 6l12 12M18 6L6 18',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  skipBack: 'M19 20L9 12l10-8zM5 4v16',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  upscale: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  flow: 'M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.3 6.9L22 12l-6.7 2.1L13 21l-2.3-6.9L4 12l6.7-2.1z',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  cursor: 'M4 4l7 17 2.5-7.5L21 11z',
  layers: 'M12 2l10 6-10 6L2 8zM2 16l10 6 10-6',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  );
}
