/** Scene strip above the timeline: live scene thumbnails, the playing one highlighted; click = jump, right-click = actions. */
import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { LiveThumb } from './pickers/LiveThumb';
import { toast } from '../components/Toast';
import { HelpButton } from '../components/HelpButton';
import { buildStory, mergeScene, sceneBlockId, splitScene } from '../motion/story/model';
import { redoMessage } from '../motion/story/prompt';
import { fmtTime } from '../lib/util';
import { openStory } from './StoryStudio';

export function SceneStrip() {
  const p = useProject();
  const time = useEditor((s) => s.time);
  const update = useEditor((s) => s.update);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const st = p.story;
  const cur = st?.scenes.findIndex((s) => time >= s.start && time < s.end) ?? -1;
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>(`[data-strip="${cur}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cur]);
  if (!st?.scenes.length) return null;
  const portrait = p.export.aspect === '9:16';
  const act = (id: string, what: 'design' | 'split' | 'merge' | 'lock' | 'stronger' | 'simpler') => {
    setMenu(null);
    if (what === 'design') return openStory(id);
    if (what === 'stronger' || what === 'simpler') {
      const n = st.scenes.findIndex((s) => s.id === id) + 1;
      return void navigator.clipboard.writeText(redoMessage(st, [n], what)).then(() => toast(`“Redo scene ${n}” copied — paste it into your story chat, then paste the answer in Story → Make it`, 'ok'));
    }
    update((d) => {
      const s = d.story!;
      if (what === 'split' && splitScene(s, id)) buildStory(d);
      else if (what === 'merge' && mergeScene(s, id)) buildStory(d);
      else if (what === 'lock') s.scenes.find((x) => x.id === id)!.locked = !s.scenes.find((x) => x.id === id)!.locked;
    });
  };
  return (
    <div className="scene-strip" data-tour="scene-strip">
      <button className="btn sm ghost strip-open" onClick={() => openStory()} title="Open Story Studio">✦ Story</button>
      <div className="strip-row" ref={row}>
        {st.scenes.map((s, i) => {
          const g = p.motion?.find((x) => x.id === sceneBlockId(s));
          return (
            <div key={s.id} data-strip={i} className={`strip-item ${i === cur ? 'on' : ''} ${s.locked ? 'locked' : ''}`} onContextMenu={(e) => (e.preventDefault(), setMenu({ id: s.id, x: e.clientX, y: e.clientY }))}>
              {g ? <LiveThumb group={{ ...g, start: 0 }} width={portrait ? 54 : 128} height={portrait ? 96 : 72} still={0.6} title={`${i + 1} · ${fmtTime(s.start)} · ${s.text}`} onClick={() => (useEditor.getState().seek(s.start + 0.05), useEditor.getState().select({ kind: 'motion', id: g.id }))} />
                : <div className="strip-empty" onClick={() => useEditor.getState().seek(s.start + 0.05)}>{i + 1}</div>}
              <span className="strip-n">{i + 1}{s.locked ? ' 🔒' : ''}{s.source === 'ai' ? ' ✦' : ''}</span>
            </div>
          );
        })}
      </div>
      <HelpButton topic="scene-strip" small />
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: Math.max(8, menu.y - 200) }} onMouseLeave={() => setMenu(null)}>
          <button onClick={() => act(menu.id, 'design')}>Change design…</button>
          <button onClick={() => act(menu.id, 'split')}>Split scene</button>
          <button onClick={() => act(menu.id, 'merge')}>Merge with next</button>
          <button onClick={() => act(menu.id, 'lock')}>Lock / unlock</button>
          <hr />
          <button onClick={() => act(menu.id, 'stronger')}>Ask the AI: stronger</button>
          <button onClick={() => act(menu.id, 'simpler')}>Ask the AI: simpler</button>
        </div>
      )}
    </div>
  );
}
