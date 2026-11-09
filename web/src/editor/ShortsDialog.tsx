import { useMemo, useState } from 'react';
import { useEditor, projectLength } from '../store';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { extractRange, suggestMoments } from '../lib/shorts';
import { fmtClock, parseClock } from '../lib/timeline';
import { saveProject } from '../lib/db';
import { navigate } from '../App';

/** Make a linked vertical Short from a range of this (long) video. */
export function ShortsDialog({ onClose }: { onClose: () => void }) {
  const p = useEditor((s) => s.project!);
  const time = useEditor((s) => s.time);
  const len = projectLength(p);
  const words = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const moments = useMemo(() => suggestMoments(words), [words.length]);
  const [a, setA] = useState(Math.min(time, Math.max(0, len - 15)));
  const [b, setB] = useState(Math.min(len, Math.min(time, Math.max(0, len - 15)) + 30));
  const [busy, setBusy] = useState(false);
  const dur = b - a;
  const create = async () => {
    if (dur < 1) return toast('Choose a range of at least 1 s', 'info');
    setBusy(true);
    try {
      const q = extractRange(p, a, b);
      await saveProject(q);
      toast(`Short created (${Math.round(dur)} s, 9:16) — set the framing per clip in Properties → Framing`, 'ok');
      onClose();
      navigate({ page: 'editor', id: q.id });
    } finally {
      setBusy(false);
    }
  };
  const field = (label: string, v: number, set: (n: number) => void) => (
    <label className="field"><span>{label}</span>
      <input key={v} defaultValue={fmtClock(v)} onBlur={(e) => {
        const n = parseClock(e.target.value);
        if (n === null) e.target.value = fmtClock(v);
        else set(Math.max(0, Math.min(len, n)));
      }} />
    </label>
  );
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Make a Shorts version</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <p className="hint">Copies a part of this video into a new <b>vertical 9:16</b> project. Media is shared; the long video is not changed. Shorts work best between 15 and 60 s.</p>
        {moments.length > 0 && (
          <>
            <h4>Suggested moments</h4>
            <div className="list">
              {moments.map((m) => (
                <button key={m.start} className={`list-item ${Math.abs(m.start - a) < 0.01 && Math.abs(m.end - b) < 0.01 ? 'on' : ''}`} onClick={() => (setA(m.start), setB(m.end))}>
                  <span className="hint">{fmtClock(m.start)} · {Math.round(m.end - m.start)} s</span> “{m.text.slice(0, 120)}{m.text.length > 120 ? '…' : ''}”
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row">
          {field('From', a, setA)}
          {field('To', b, setB)}
          <button className="btn sm ghost" onClick={() => (setA(time), setB(Math.min(len, time + 30)))}>From the playhead</button>
        </div>
        <p className={dur > 60 ? 'warn' : 'hint'}>{Math.round(dur)} s{dur > 60 ? ' — YouTube Shorts can be up to 3 minutes, but 15–60 s performs best' : ''}</p>
        <div className="row">
          <button className="btn primary" disabled={busy || dur < 1} onClick={create}><Icon name="film" /> Create Short</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
