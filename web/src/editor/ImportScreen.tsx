import { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { useEditor, findAsset } from '../store';
import { importAudio, importVisuals, kindOf, probe } from '../lib/project';
import { uid } from '../lib/util';
import { FilePick, Progress } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { ReviewTable, reviewReady } from './ReviewTable';
import { toReviewItems, type ReviewItem } from './review';
import type { Project } from '../types';

/** Pick visuals, review their timestamps, then add them to the project. */
export function ImportReview({ project, voice, onBuilt, cta = 'Validate & build timeline →' }: { project: Project; voice?: File | null; onBuilt?: () => void; cta?: string }) {
  const update = useEditor((s) => s.update);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);
  const voDur = voice ? null : project.voiceover ? findAsset(project, project.voiceover.assetId)?.duration ?? null : null;
  const [voiceDur, setVoiceDur] = useState<number | null>(null);
  // A voiceover dropped into the list counts like the separate voiceover box.
  const voiceFile = voice ?? (items.find((i) => i.kind === 'audio' && i.include && i.audioRole === 'voiceover')?.file as File | undefined) ?? null;
  useEffect(() => {
    if (!voiceFile) return setVoiceDur(null);
    const u = URL.createObjectURL(voiceFile);
    const a = new Audio(u);
    a.onloadedmetadata = () => (setVoiceDur(a.duration), URL.revokeObjectURL(u));
  }, [voiceFile]);
  const length = voiceDur ?? voDur;
  const add = async (files: File[]) => {
    // A scenes.json from the Flow bridge can be dropped together with the downloads.
    const sj = files.find((f) => /scenes\.json$/i.test(f.name));
    if (sj) {
      try {
        const scenes = JSON.parse(await sj.text()).scenes;
        if (Array.isArray(scenes)) {
          update((d) => void (d.flowScenes = scenes));
          toast(`Loaded ${scenes.length} Flow scenes`, 'ok');
        }
      } catch {
        toast('Could not read scenes.json', 'error');
      }
    }
    setItems((cur) => {
      const names = new Set(cur.map((c) => c.name));
      const hasVoice = !!voice || !!project.voiceover || cur.some((c) => c.audioRole === 'voiceover');
      return [...cur, ...toReviewItems(files.filter((f) => !names.has(f.name)), hasVoice)];
    });
  };
  const ready = reviewReady(items, length);
  const build = async () => {
    const chosen = items.filter((i) => i.include && i.time !== null && i.kind !== 'audio');
    const sounds = items.filter((i) => i.include && i.kind === 'audio');
    setBusy(0);
    try {
      let next = voice ? await importAudio(project, [voice], { asVoiceover: true }) : project;
      for (const a of sounds) {
        const file = a.file as File;
        if (a.audioRole === 'voiceover') next = await importAudio(next, [file], { asVoiceover: true });
        else if (a.audioRole === 'music') {
          next = await importAudio(next, [file], { asMusic: true });
          const m = next.music[next.music.length - 1];
          if (m) m.start = a.time ?? 0;
        } else {
          const asset = await probe(file, a.name, 'audio');
          next = { ...next, assets: [...next.assets, asset], sfx: [...next.sfx, { id: uid(), sound: `asset:${asset.id}`, start: a.time ?? 0, volume: 0.8 }] };
        }
      }
      next = await importVisuals(next, chosen.map((i) => ({ file: i.file, name: i.name, time: i.time! })), setBusy);
      update((d) => Object.assign(d, next));
      toast(`Added ${chosen.length} clips${sounds.length ? ` · ${sounds.length} sound file${sounds.length > 1 ? 's' : ''}` : ''}`, 'ok');
      onBuilt?.();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <FilePick className="drop" accept="image/*,video/*,audio/*,.json" multiple onFiles={add}>
        <span className="icon"><Icon name="media" size={20} /></span>
        <b>{items.length ? 'Add more media' : 'Storyboard images, video & sound'}</b>
        <span>Images or video clips named by timestamp (0-00, 0-06…), Flow downloads (001_v1…), and sound files (voiceover, music, sound effects). Drop files or whole folders — even several at once.</span>
      </FilePick>
      {items.length > 0 && <ReviewTable items={items} setItems={(f) => setItems(f)} length={length} flowScenes={project.flowScenes} />}
      {busy !== null ? (
        <Progress value={busy / Math.max(1, items.filter((i) => i.include).length)} label={`Importing ${busy}…`} />
      ) : (
        <button className="btn primary lg" disabled={!ready} onClick={build}>{cta}</button>
      )}
      {items.length > 0 && !ready && <p className="hint center">Fix the rows marked “No time”, “Check” or “Duplicate” (bulk actions above help) — or skip them.</p>}
    </>
  );
}

export function ImportScreen() {
  const p = useEditor((s) => s.project!);
  const update = useEditor((s) => s.update);
  const [voice, setVoice] = useState<File | null>(null);
  const existingVo = p.voiceover && p.assets.find((a) => a.id === p.voiceover!.assetId);
  return (
    <main className="import">
      <div className="ed-top">
        <button className="icon-btn" onClick={() => navigate({ page: 'projects' })}><Icon name="back" /></button>
        <input className="title" value={p.name} onChange={(e) => update((d) => void (d.name = e.target.value), 'name')} />
      </div>
      <h2>Sync your images to a voiceover, automatically.</h2>
      <p className="hint center">
        Name each image or video clip with the second it appears — <code>0-03.png</code> or <code>0-03.mp4</code> cuts in at 0:03 — then import them with your voiceover. Video clips can be trimmed, zoomed, and their sound mixed under the narration. Review everything below, then build the timeline. Everything runs on your device. Nothing is uploaded.
      </p>
      <FilePick className={`drop slim ${voice || existingVo ? 'done' : ''}`} accept="audio/*" onFiles={(f) => setVoice(f.find((x) => kindOf(x) === 'audio') ?? null)}>
        <span className="row"><Icon name={voice || existingVo ? 'check' : 'music'} size={18} /> <b>{voice?.name ?? existingVo?.name ?? 'Voiceover audio'}</b></span>
        <span>One MP3 or WAV — sets the total length (optional)</span>
      </FilePick>
      <ImportReview project={p} voice={voice} />
      <p className="hint center">No visuals yet? Try <a href="#tools/images">AI Images</a>, the <a href="#tools/flow">Google Flow bridge</a> or <a href="#tools/auto">Script → Video</a>.</p>
    </main>
  );
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const p = useEditor((s) => s.project!);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Add media</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <ImportReview project={p} onBuilt={onClose} cta="Validate & add to timeline" />
      </div>
    </div>
  );
}
