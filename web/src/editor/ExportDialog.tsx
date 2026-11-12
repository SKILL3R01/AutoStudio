import { useRef, useState } from 'react';
import { useEditor, projectLength } from '../store';
import { useLines, useProject } from './hooks';
import { Progress, Select } from '../components/ui';
import { Icon } from '../components/icons';
import { outputSize } from '../render/renderer';
import { exportAudio, type AudioFormat, exportVideo, videoBitrate } from '../export/exporter';
import { beatsFor } from '../audio/beats';
import type { Stem } from '../audio/mix';
import { toSrt } from '../lib/captions';
import { download, fmtTime } from '../lib/util';
import type { ExportSettings } from '../types';

const PRESETS: { id: string; name: string; desc: string; s: Partial<ExportSettings> }[] = [
  { id: 'yt', name: 'YouTube', desc: '16:9 · 1080p · 30 fps', s: { aspect: '16:9', resolution: 'full', fps: 30 } },
  { id: 'shorts', name: 'Shorts / TikTok / Reels', desc: '9:16 · 1080×1920 · 30 fps', s: { aspect: '9:16', resolution: 'full', fps: 30 } },
  { id: 'ig', name: 'Instagram feed', desc: '4:5 · 1080×1350', s: { aspect: '4:5', resolution: 'full', fps: 30 } },
  { id: 'sq', name: 'Square', desc: '1:1 · 1080×1080', s: { aspect: '1:1', resolution: 'full', fps: 30 } },
  { id: 'draft', name: 'Quick draft', desc: '720p · medium · fast', s: { resolution: '720', quality: 'medium' } },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [audioFmt, setAudioFmt] = useState<AudioFormat>('wav');
  const [audioWhat, setAudioWhat] = useState('mix');
  const [audioBusy, setAudioBusy] = useState(false);
  const p = useProject();
  const lines = useLines();
  const update = useEditor((s) => s.update);
  const [state, setState] = useState<{ stage: string; progress: number } | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController>(null);
  const { W, H } = outputSize(p);
  const e = p.export;
  const set = (patch: Partial<ExportSettings>) => update((d) => void Object.assign(d.export, patch));
  const name = p.name.replace(/[^\w\- ]+/g, '') || 'video';
  const mb = ((videoBitrate(p, W, H) + 192000) * projectLength(p)) / 8 / 1e6;

  // Long videos: one section, or every section as its own file (start from section N to resume after a stop).
  const sections = p.director?.sections ?? [];
  const [part, setPart] = useState<string>('all');
  const [from, setFrom] = useState(1);
  const run = async () => {
    setError('');
    useEditor.getState().setPlaying(false);
    abort.current = new AbortController();
    try {
      const beats = await beatsFor(p);
      const file = (suffix = '') => `${name}${suffix}_${e.aspect.replace(':', 'x')}.${e.format}`;
      if (part === 'all') download(await exportVideo(p, lines, setState, abort.current.signal, beats), file());
      else {
        const todo = part === 'each' ? sections.slice(Math.max(0, from - 1)) : [sections[+part]];
        for (const [k, sec] of todo.entries()) {
          const blob = await exportVideo(p, lines, (st) => setState({ ...st, stage: `Part ${sec.i + 1} of ${sections.length} (${k + 1}/${todo.length}) · ${st.stage}` }), abort.current.signal, beats, { start: sec.start, end: sec.end });
          download(blob, file(` - part ${String(sec.i + 1).padStart(2, '0')}`));
          setFrom(sec.i + 2);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setState(null);
    }
  };

  return (
    <div className="modal-bg" onClick={() => !state && onClose()}>
      <div className="modal wide" onClick={(ev) => ev.stopPropagation()}>
        <div className="row between"><h3>Export</h3>{!state && <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>}</div>
        <div className="presets">
          {PRESETS.map((pr) => {
            const on = Object.entries(pr.s).every(([k, v]) => (e as unknown as Record<string, unknown>)[k] === v);
            return (
              <button key={pr.id} className={`preset ${on ? 'on' : ''}`} onClick={() => set(pr.s)}>
                <b>{pr.name}</b>
                <span>{pr.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <Select label="Aspect" value={e.aspect} options={[['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5']]} onChange={(v) => set({ aspect: v })} />
          <Select label="Resolution" value={e.resolution} options={[['full', '1080p'], ['720', '720p'], ['480', '480p']]} onChange={(v) => set({ resolution: v })} />
          <Select label="FPS" value={e.fps} options={[24, 25, 30, 60]} onChange={(v) => set({ fps: v })} />
        </div>
        <div className="row">
          <Select label="Quality" value={e.quality} options={[['high', 'High (8 Mbps @1080p)'], ['medium', 'Medium (5 Mbps)'], ['low', 'Low (2.5 Mbps)']]} onChange={(v) => set({ quality: v })} />
          <Select label="Format" value={e.format} options={[['mp4', 'MP4 (H.264 + AAC)'], ['webm', 'WebM (VP9 + Opus)']]} onChange={(v) => set({ format: v })} />
          <Select label="Fill for 'fit' clips" value={e.background} options={[['blur', 'Blurred background'], ['black', 'Black bars']]} onChange={(v) => set({ background: v })} />
        </div>
        <dl className="specs">
          <dt>Output</dt><dd>{W}×{H} · {e.fps} fps · {(videoBitrate(p, W, H) / 1e6).toFixed(1)} Mbps</dd>
          <dt>Length</dt><dd>{fmtTime(projectLength(p))}</dd>
          <dt>Estimated size</dt><dd>~{mb.toFixed(0)} MB</dd>
        </dl>
        {state ? (
          <div className="row">
            <Progress value={state.progress} label={state.stage} />
            <button className="btn ghost" onClick={() => abort.current?.abort()}>Cancel</button>
          </div>
        ) : (
          <div className="row end wrap">
            <select value={audioFmt} onChange={(ev) => setAudioFmt(ev.target.value as AudioFormat)} title="Audio format">
              <option value="wav">WAV</option><option value="m4a">M4A (AAC)</option><option value="ogg">OGG (Opus)</option>
            </select>
            <select value={audioWhat} onChange={(ev) => setAudioWhat(ev.target.value)} title="What to export">
              <option value="mix">Full mix</option><option value="voice">Voice only</option><option value="music">Music only</option><option value="sfx">SFX only</option><option value="clips">Clip sound only</option><option value="stems">All stems (zip)</option>
            </select>
            <button className="btn ghost" disabled={audioBusy} onClick={async () => {
              setAudioBusy(true);
              try {
                const stems = audioWhat === 'mix' ? undefined : audioWhat === 'stems' ? (['voice', 'music', 'sfx', 'clips'] as Stem[]) : [audioWhat as Stem];
                const r = await exportAudio(p, { format: audioFmt, stems });
                download(r.blob, `${name}_${audioWhat}.${r.ext}`);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setAudioBusy(false);
              }
            }}><Icon name="music" /> {audioBusy ? 'Rendering audio…' : 'Export audio'}</button>
            <button className="btn ghost" disabled={!lines.length} onClick={() => download(new Blob([toSrt(lines)]), `${name}.srt`)}><Icon name="captions" /> Subtitles (SRT)</button>
            {sections.length > 1 && (
              <span className="row">
                <select value={part} onChange={(ev) => setPart(ev.target.value)} title="Long videos: export in parts">
                  <option value="all">Whole video</option>
                  <option value="each">Each section as its own file</option>
                  {sections.map((sec) => <option key={sec.i} value={String(sec.i)}>Section {sec.i + 1} ({fmtTime(sec.start)}–{fmtTime(sec.end)})</option>)}
                </select>
                {part === 'each' && <label className="field"><span>from section</span><input type="number" min={1} max={sections.length} value={from} onChange={(ev) => setFrom(Math.max(1, Math.min(sections.length, +ev.target.value || 1)))} style={{ width: 56 }} /></label>}
              </span>
            )}
            <button className="btn primary" disabled={!p.clips.length && !p.motion?.length} onClick={run}><Icon name="export" /> Export video</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <p className="hint">Rendered on your device with WebCodecs (hardware-accelerated in Edge/Chrome). Keep this tab visible while exporting.</p>
      </div>
    </div>
  );
}
