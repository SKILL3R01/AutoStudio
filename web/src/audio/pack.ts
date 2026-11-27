import pack from './pack/pack.json';

/** A real recording from the bundled CC0 sound pack (built by scripts/build-sfx-pack.py, credits in pack/CREDITS.md). */
export interface PackSound { id: string; rule: string; file: string; title: string; author: string; source: string; licence: string; duration: number }

export const PACK: PackSound[] = pack;
const URLS = import.meta.glob('./pack/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export const packUrl = (id: string): string | undefined => URLS[`./pack/${id}.mp3`];
export const packSound = (id: string) => PACK.find((s) => s.id === id);
/** All recordings for a script-sound rule (e.g. 'typing'). */
export const packFor = (rule: string) => PACK.filter((s) => s.rule === rule);

/**
 * Built-in sound names that now play a real recording instead of the synthesised version (used by the SFX list,
 * motion finishing and older projects).
 */
export const RECORDED_ALIAS: Record<string, string> = {
  typing: 'typing_1', steps: 'steps_1', heartbeat: 'heartbeat_2', shutter: 'camera_1', paper: 'page_2', pen: 'pen_1',
  breath: 'breath_1', knock: 'knock_1', thunder: 'thunder_1', rain: 'rain_1', wind: 'wind_1',
};

/** Display name of a clip's built-in sound (`rec:typing_1` → "Computer Keyboard"). */
export const soundLabel = (name?: string) => (name?.startsWith('rec:') ? packSound(name.slice(4))?.title ?? name : name);
