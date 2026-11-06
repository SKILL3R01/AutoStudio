/** Simple / Pro interface. Simple groups the editor into 5 areas and folds advanced settings away. */
import { create } from 'zustand';

export type UiMode = 'simple' | 'pro';

export const useUi = create<{ mode: UiMode; setMode: (m: UiMode) => void }>((set) => ({
  mode: (globalThis.localStorage?.getItem('uiMode') as UiMode | null) ?? 'simple',
  setMode: (mode) => (localStorage.setItem('uiMode', mode), set({ mode })),
}));

/** Sections folded by default in Simple mode (always one click away). */
export const ADVANCED_SECTIONS = new Set([
  'Depth & animated details', 'Animate with AI (Colab)', '3D depth motion', '3D depth (in your browser)',
  'Light', 'Colour', 'Style & LUT', 'Enhance & effects', 'Scene fades', 'Words', 'Prompt Studio',
]);

/** Remembered open / closed state per section title; `undefined` = use the default. */
export const sectionOpen = (title: string): boolean | undefined => {
  const v = globalThis.localStorage?.getItem(`sec:${title}`);
  return v === null || v === undefined ? undefined : v === '1';
};
export const setSectionOpen = (title: string, open: boolean) => localStorage.setItem(`sec:${title}`, open ? '1' : '0');
