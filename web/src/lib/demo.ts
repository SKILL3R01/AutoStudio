import { createProject } from './scenes';
import { spreadWords } from './captions';
import { uid } from './util';
import { saveProject } from './db';
import { autoBlocks } from './typography';

const SCENES = [
  ['#1e3c72', '#2a5298', 'Morning city'],
  ['#ff7e5f', '#feb47b', 'Sunrise run'],
  ['#134e5e', '#71b280', 'Forest path'],
  ['#41295a', '#2f0743', 'Night sky'],
  ['#ee0979', '#ff6a00', 'Big finish'],
  ['#0f2027', '#2c5364', 'The end'],
];

const SCRIPT = 'Have you ever gone to bed full of plans for the morning, and woken up already behind? Ever told yourself tomorrow I start, then watched tomorrow slip away? What if you are not lazy at all? What if every morning you lose the same fight before it even begins?';

async function sceneImage(a: string, b: string, label: string, i: number) {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 900;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 1600, 900);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1600, 900);
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + (k % 4) * 0.03})`;
    g.beginPath();
    g.arc((k * 337 + i * 101) % 1600, (k * 211 + i * 53) % 900, 40 + ((k * 29) % 160), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 640, 1600, 260);
  g.fillStyle = '#fff';
  g.font = '800 110px Montserrat, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 800, 470);
  return new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
}

export async function createDemoProject() {
  await document.fonts.ready;
  const step = 3;
  const images = await Promise.all(SCENES.map(async ([a, b, l], i) => ({ blob: await sceneImage(a, b, l, i), name: `0-${String(i * step).padStart(2, '0')}.png`, t: i * step })));
  const p = await createProject({ name: 'Demo project', images, words: spreadWords(SCRIPT, 0.4, SCENES.length * step - 0.5) });
  p.length = SCENES.length * step;
  p.clips.forEach((c, i) => (c.transition = i ? 'random' : 'none'));
  p.overlays.push({ id: uid(), text: 'AutoStudio demo', start: 0.3, duration: 3.5, x: 0.5, y: 0.16, size: 1.1, color: '#ffffff', font: 'Bebas Neue', weight: 400, rotate: 0, blur: 0, opacity: 1, fadeIn: 0.4, fadeOut: 0.4, background: 'transparent', shadow: true });
  p.effects.push({ kind: 'grain', intensity: 0.4 }, { kind: 'vignette', intensity: 0.4 });
  p.sfx.push({ id: uid(), sound: 'whoosh', start: 2.6, volume: 0.6 });
  p.captions.mode = 'both';
  p.typo = autoBlocks(p.words, { ...p.typoSettings, density: 3 });
  await saveProject(p);
  return p;
}
