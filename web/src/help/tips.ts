/** Contextual tips (one small card at the right moment, at most one every 3 minutes, never the same twice). */
export const TIPS: Record<string, { en: string; ar: string }> = {
  'story-built': { en: 'Hover a scene card to play it. Click it to try other designs — each one already shows your words.', ar: 'مرّر الماوس على بطاقة المشهد لتشغيله. اضغط عليها لتجربة تصاميم أخرى — كل تصميم يعرض كلماتك.' },
  'story-ai-done': { en: 'Tick scenes you don’t like (✓) and press “Stronger” to redo only those.', ar: 'علّم المشاهد التي لا تعجبك (✓) واضغط «أقوى» لإعادتها فقط.' },
  'scene-edited': { en: 'Double-click any text on the preview to type in place.', ar: 'انقر مرتين على أي نص في المعاينة للكتابة مكانه.' },
  'layer-dragged': { en: 'Hold Shift while dragging to ignore snapping. Alt-click picks the layer underneath.', ar: 'اضغط Shift أثناء السحب لتجاهل الالتصاق. Alt مع النقر يختار الطبقة التي تحتها.' },
  'export-long': { en: 'Long video? Export each section as its own file — if it stops, restart from that section.', ar: 'فيديو طويل؟ صدّر كل قسم كملف منفصل — إذا توقف ابدأ من ذلك القسم.' },
};
const SEEN = 'help:seen', OFF = 'help:tipsOff', GAP = 180_000;
let last = 0;
const seen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) || '[]');
  } catch {
    return [];
  }
};
export const markSeen = (id: string) => localStorage.setItem(SEEN, JSON.stringify([...new Set([...seen(), id])]));
export const wasSeen = (id: string) => seen().includes(id);
export const tipsOff = () => localStorage.getItem(OFF) === '1';
export const setTipsOff = (off: boolean) => localStorage.setItem(OFF, off ? '1' : '0');

/** Show a tip if it is new, tips are on and none was shown in the last 3 minutes. */
export function tip(id: keyof typeof TIPS | string) {
  if (!TIPS[id] || tipsOff() || wasSeen(`tip:${id}`) || Date.now() - last < GAP) return;
  last = Date.now();
  markSeen(`tip:${id}`);
  window.dispatchEvent(new CustomEvent('autostudio:tip', { detail: id }));
}
