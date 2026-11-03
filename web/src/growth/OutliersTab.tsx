import { useState } from 'react';
import { channelsById, outlierScore, searchVideos, useYt, type Video } from '../lib/youtube';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { NeedKey, VideoRow } from './shared';

/** Videos that got far more views than their channel's size — proven ideas for a small channel. */
export function OutliersTab({ seed, onSetup }: { seed?: string; onSetup: () => void }) {
  const key = useYt((s) => s.key);
  const [q, setQ] = useState(seed ?? '');
  const [days, setDays] = useState(90);
  const [length, setLength] = useState<'any' | 'medium' | 'long' | 'short'>('any');
  const [maxSubs, setMaxSubs] = useState(100_000);
  const [minRatio, setMinRatio] = useState(3);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ v: Video; subs: number }[]>([]);

  const run = async () => {
    setBusy(true);
    try {
      const after = new Date(Date.now() - days * 86400_000).toISOString();
      const videos = await searchVideos(q.trim(), { order: 'viewCount', publishedAfter: after, videoDuration: length, max: 50 });
      const subs = new Map((await channelsById(videos.map((v) => v.channelId))).map((c) => [c.id, c.subs]));
      setRows(videos.map((v) => ({ v, subs: subs.get(v.channelId) ?? 0 })).sort((a, b) => outlierScore(b.v.views, b.subs) - outlierScore(a.v.views, a.subs)));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const shown = rows.filter((r) => r.subs <= maxSubs && outlierScore(r.v.views, r.subs) >= minRatio);

  return (
    <div className="card">
      {!key && <NeedKey onSetup={onSetup} />}
      <h3>Outlier videos</h3>
      <p className="hint">Search a niche: the most-viewed recent videos, ranked by views ÷ channel subscribers. A ×20 video from a 5K channel means the <b>idea</b> worked, not the channel.</p>
      <div className="row wrap">
        <input value={q} placeholder="niche or topic, e.g. ancient history" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && run()} style={{ flex: 2, minWidth: 220 }} />
        <select value={days} onChange={(e) => setDays(+e.target.value)}>
          {[[30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
          <option value="any">Any length</option><option value="medium">4–20 min</option><option value="long">20+ min</option><option value="short">Under 4 min</option>
        </select>
        <button className="btn primary" disabled={busy || !q.trim() || !key} onClick={run}><Icon name="bolt" /> {busy ? 'Searching…' : 'Find outliers (~102 units)'}</button>
      </div>
      {rows.length > 0 && (
        <div className="row wrap">
          <label className="inline hint">Channels up to <select value={maxSubs} onChange={(e) => setMaxSubs(+e.target.value)}>
            {[10_000, 50_000, 100_000, 500_000, 1e9].map((v) => <option key={v} value={v}>{v >= 1e9 ? 'any size' : `${v / 1000}K subs`}</option>)}
          </select></label>
          <label className="inline hint">At least <select value={minRatio} onChange={(e) => setMinRatio(+e.target.value)}>
            {[0, 1, 3, 10, 30].map((v) => <option key={v} value={v}>×{v}</option>)}
          </select></label>
          <span className="hint">{shown.length} of {rows.length} videos</span>
        </div>
      )}
      {shown.map((r) => (
        <VideoRow key={r.v.id} v={r.v} subs={r.subs} actions={<button className="icon-btn" title="Copy title" onClick={() => void navigator.clipboard.writeText(r.v.title).then(() => toast('Title copied', 'ok'))}><Icon name="copy" /></button>} />
      ))}
    </div>
  );
}
