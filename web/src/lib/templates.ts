/** Video templates: one click sets the format, caption style, typography look, colour look and Auto-edit pacing. */
import { LOOKS } from '../render/grade';
import type { AutoOptions } from './autoedit';
import type { Project, TypoTemplate } from '../types';

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  aspect: '16:9' | '9:16' | '1:1';
  caption: string;
  typo: { template: TypoTemplate; palette: string; fontPair: string };
  look: string;
  autoEdit: Pick<AutoOptions, 'target' | 'transitions'>;
}

export const TEMPLATES: VideoTemplate[] = [
  { id: 'shorts-story', name: 'Shorts story', description: 'Vertical, fast cuts, bold captions', aspect: '9:16', caption: 'hormozi', typo: { template: 'punch', palette: 'mono-yellow', fontPair: 'spartan-pacifico' }, look: 'vivid', autoEdit: { target: 2.5, transitions: 'cuts' } },
  { id: 'top10', name: 'Top-10 list', description: 'Punchy titles, poster colours', aspect: '16:9', caption: 'pill', typo: { template: 'stack', palette: 'yellow-frame', fontPair: 'archivo-dancing' }, look: 'teal-orange', autoEdit: { target: 4, transitions: 'mixed' } },
  { id: 'documentary', name: 'Documentary', description: 'Slow, cinematic, classic captions', aspect: '16:9', caption: 'classic', typo: { template: 'scriptCaps', palette: 'mono-yellow', fontPair: 'oswald-caveat' }, look: 'warm-film', autoEdit: { target: 6, transitions: 'soft' } },
  { id: 'motivation', name: 'Motivation', description: 'Moody look, gold highlights', aspect: '16:9', caption: 'gold', typo: { template: 'mixed', palette: 'mono-yellow', fontPair: 'spartan-pacifico' }, look: 'moody', autoEdit: { target: 3.5, transitions: 'mixed' } },
  { id: 'calm-explainer', name: 'Calm explainer', description: 'Clean, readable, natural colour', aspect: '16:9', caption: 'boxed', typo: { template: 'stackSide', palette: 'black-yellow', fontPair: 'archivo-dancing' }, look: 'natural', autoEdit: { target: 5, transitions: 'soft' } },
];

/** Apply a template to a project draft (keeps all content; only the look and format change). */
export function applyTemplate(d: Project, t: VideoTemplate) {
  d.templateId = t.id;
  d.export.aspect = t.aspect;
  d.captions.style = t.caption;
  Object.assign(d.typoSettings, t.typo);
  for (const b of d.typo) if (!b.locked) Object.assign(b, { template: t.typo.template, palette: t.typo.palette, fontPair: t.typo.fontPair });
  const look = LOOKS.find((l) => l.id === t.look);
  if (look) d.color = structuredClone({ ...look.grade });
}
