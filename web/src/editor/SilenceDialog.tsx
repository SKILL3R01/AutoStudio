import { narrationClips } from '../lib/audiotracks';
import { useEffect, useMemo, useState } from 'react';
import { useEditor, findAsset } from '../store';
import { media } from '../render/media';
import { analyzeLevels, cutBuffer, detectSilences, encodeWav, type Levels, type Range, type SilenceOptions } from '../audio/silence';
import { applyCuts } from './edit';
import { probe } from '../lib/project';
import { Seg, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';

interface Pause extends Range {
  approved: boolean;
}

export function SilenceDialog({ onClose, clipId }: { onClose: () => void; clipId?: string }) {
  const p = useEditor((s) => s.project!);
  const update = useEditor((s) => s.update);
  const first = clipId ? p.audio.find((c) => c.id === clipId) : narrationClips(p)[0];
  const vo = first && findAsset(p, first.assetId);
  const [buf, setBuf] = useState<AudioBuffer>();
  const [lv, setLv] = useState<Levels>();
  const [opts, setOpts] = useState<SilenceOptions>({ threshold: 'auto', minPause: 0.6, padding: 0.15 });
  const [mode, setMode] = useState<'remove' | 'shorten'>('remove');
  const [keep, setKeep] = useState(0.4);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [skipUnder, setSkipUnder] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vo) return;
    void media.audioBuffer(vo.id).then((b) => b && (setBuf(b), setLv(analyzeLevels(b))));
  }, [vo?.id]);
  useEffect(() => {
    if (lv) setPauses(detectSilences(lv, opts).map((r) => ({ ...r, approved: true })));
  }, [lv, opts]);

  const off = first ? first.start - first.trimIn : 0;
  const words = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const around = (r: Range) => {
    const before = words.filter((w) => w.end <= r.start + off + 0.05).slice(-3).map((w) => w.text).join(' ');
    const after = words.filter((w) => w.start >= r.end + off - 0.05).slice(0, 3).map((w) => w.text).join(' ');
    return { before, after };
  };
  /** In "shorten" mode a pause keeps `keep` seconds in its middle instead of disappearing. */
  const cutsFor = (list: Pause[]) =>
    list.filter((x) => x.approved && x.end - x.start > skipUnder).map((x) => {
      if (mode === 'remove') return { start: x.start, end: x.end };
      const extra = x.end - x.start - keep;
      return extra > 0.05 ? { start: x.start + keep / 2, end: x.end - keep / 2 } : null;
    }).filter((x): x is Range => !!x);
  const cuts = useMemo(() => cutsFor(pauses), [pauses, mode, keep, skipUnder]);
  const saved = cuts.reduce((a, c) => a + c.end - c.start, 0);

  const listen = (r: Range) => {
    if (!buf) return;
    const c = new AudioContext();
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    const from = Math.max(0, r.start - 1);
    s.start(0, from, Math.min(buf.duration - from, r.end - from + 1));
    s.onended = () => void c.close();
  };

  const apply = async () => {
    if (!buf || !cuts.length || !vo) return;
    setBusy(true);
    try {
      const out = cutBuffer(buf, cuts);
      const asset = await probe(encodeWav(out), vo.name.replace(/(\.[^.]+)?$/, '_trimmed.wav'), 'audio');
      update((d) => {
        d.assets.push(asset);
        applyCuts(d, cuts, asset.id, vo.id);
      });
      toast(`Removed ${cuts.length} pause${cuts.length > 1 ? 's' : ''} · saved ${saved.toFixed(1)} s (Undo restores the original)`, 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Remove silences</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        {!vo ? <p className="warn">Add a voiceover first.</p> : (
          <>
            <p className="hint">Finds the pauses in <b>{vo.name}</b>. Listen, approve the ones to cut, then apply. Captions, typography, sound effects and clips move with the voice. The original file is kept — Undo brings everything back.</p>
            <div className="row wrap">
              <div className="field" style={{ minWidth: 220 }}>
                <span>Sensitivity</span>
                <Seg<number | 'auto'> options={[['auto', 'Auto'], [-50, 'Gentle'], [-38, 'Aggressive']]} value={opts.threshold} onChange={(v) => setOpts({ ...opts, threshold: v })} />
              </div>
              <div className="field" style={{ minWidth: 220 }}>
                <span>Mode</span>
                <Seg options={[['remove', 'Remove'], ['shorten', 'Shorten']] as const} value={mode} onChange={setMode} />
              </div>
            </div>
            <Slider label="Min pause" value={opts.minPause} min={0.2} max={3} step={0.05} onChange={(v) => setOpts({ ...opts, minPause: v })} suffix="s" />
            <Slider label="Keep padding" value={opts.padding} min={0} max={0.6} step={0.01} onChange={(v) => setOpts({ ...opts, padding: v })} suffix="s" />
            {mode === 'shorten' && <Slider label="Shorten to" value={keep} min={0.1} max={2} step={0.05} onChange={setKeep} suffix="s" />}
            <div className="row wrap">
              <b>{pauses.length} pauses found</b>
              <span className="chip">{cuts.length} to cut · saves {saved.toFixed(1)} s</span>
              <div className="grow" />
              <button className="btn sm" onClick={() => setPauses((l) => l.map((x) => ({ ...x, approved: true })))}>Approve all</button>
              <button className="btn sm ghost" onClick={() => setPauses((l) => l.map((x) => ({ ...x, approved: false })))}>Skip all</button>
              <span className="inline hint">Skip pauses under <input type="number" min={0} step={0.1} value={skipUnder} onChange={(e) => setSkipUnder(+e.target.value)} />s</span>
            </div>
            <div className="silence-list">
              {!lv && <p className="hint">Analysing the voiceover…</p>}
              {pauses.map((x, k) => {
                const { before, after } = around(x);
                const short = x.end - x.start <= skipUnder;
                return (
                  <div key={k} className={`silence-row ${x.approved && !short ? 'on' : 'off'}`}>
                    <input type="checkbox" checked={x.approved && !short} disabled={short} onChange={(e) => setPauses((l) => l.map((y, j) => (j === k ? { ...y, approved: e.target.checked } : y)))} />
                    <code>{(x.start + off).toFixed(2)}s</code>
                    <span className="chip">{(x.end - x.start).toFixed(2)} s</span>
                    <span className="hint ctx">…{before} <b>⏸</b> {after}…</span>
                    <button className="icon-btn" onClick={() => listen(x)} title="Listen (1 s before → 1 s after)"><Icon name="play" /></button>
                  </div>
                );
              })}
            </div>
            <div className="row end">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={busy || !cuts.length} onClick={apply}>{busy ? 'Cutting…' : `Apply · cut ${cuts.length}`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
