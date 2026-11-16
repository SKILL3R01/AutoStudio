/**
 * Copy text and say honestly whether it worked: the async clipboard API first, then a hidden textarea +
 * execCommand('copy') (works when the window lost focus or the API is blocked). Never pretends.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  return legacyCopy(text);
}

export function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  const sel = document.getSelection(), prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  if (prev && sel) (sel.removeAllRanges(), sel.addRange(prev));
  return ok;
}
