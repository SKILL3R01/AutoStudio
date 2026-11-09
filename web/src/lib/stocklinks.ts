/** Search words + links to stock sites (the user downloads there and imports the files). */

export type StockKind = 'image' | 'video' | 'music' | 'sfx';

/** Credit line kept in older projects (free-media search was removed in v3.0). */
export interface Credit {
  assetId: string;
  title: string;
  creator: string;
  license: string;
  page: string;
  required: boolean;
}

/** Short search words from a narration line (drops filler words). */
export function keywordsFrom(text: string, max = 4): string {
  const stop = new Set('a an the and or but if then so of to in on at for with by from as is are was were be been being it its this that these those you your we our they their he she his her i me my not no do does did have has had will would can could should just very really what when where who why how all any some more most there here up down out about over into than too also only even ever every one'.split(' '));
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const seen = new Set<string>();
  return words.filter((w) => !seen.has(w) && seen.add(w)).slice(0, max).join(' ');
}

export const siteLinks = (q: string, kind: StockKind) => {
  const s = encodeURIComponent(q.trim());
  const slug = q.trim().toLowerCase().replace(/\s+/g, '-');
  return [
    { label: 'Pexels', url: kind === 'video' ? `https://www.pexels.com/search/videos/${s}/` : `https://www.pexels.com/search/${s}/` },
    { label: 'Pixabay', url: kind === 'video' ? `https://pixabay.com/videos/search/${slug}/` : kind === 'music' ? `https://pixabay.com/music/search/${slug}/` : kind === 'sfx' ? `https://pixabay.com/sound-effects/search/${slug}/` : `https://pixabay.com/images/search/${slug}/` },
  ];
};
