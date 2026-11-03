import { useEffect, useState } from 'react';
import { channelPulse, channelsById, latestUploads, resolveChannel, useYt, type Channel, type Video } from '../lib/youtube';
import { NICHES, compact, earnings, money, nicheById } from '../lib/growth';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { NeedKey, Stat, VideoRow } from './shared';

interface Snap {
  t: number;
  subs: number;
  views: number;
  videos: number;
}
interface Tracked {
  id: string;
  niche?: string;
  snaps: Snap[];
}

const KEY = 'ytCompetitors';
const load = (): Tracked[] => JSON.parse(localStorage.getItem(KEY) ?? '[]');
const store = (t: Tracked[]) => localStorage.setItem(KEY, JSON.stringify(t));

/** Daily views from snapshots (needs ≥ 2 days of history), else the views of the last 30 days of uploads. */
function monthlyViews(t: Tracked, uploads: Video[]): { value: number; from: 'history' | 'uploads' } {
  const s = t.snaps;
  if (s.length >= 2 && s[s.length - 1].t - s[0].t >= 2 * 86400_000) {
    const days = (s[s.length - 1].t - s[0].t) / 86400_000;
    return { value: ((s[s.length - 1].views - s[0].views) / days) * 30, from: 'history' };
  }
  return { value: uploads.filter((v) => Date.now() - Date.parse(v.publishedAt) < 30 * 86400_000).reduce((a, v) => a + v.views, 0), from: 'uploads' };
}

export function CompetitorsTab({ onSetup }: { onSetup: () => void }) {
  const key = useYt((s) => s.key);
  const [tracked, setTracked] = useState<Tracked[]>(load);
  const [info, setInfo] = useState<Map<string, { ch: Channel; uploads: Video[] }>>(new Map());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const save = (t: Tracked[]) => (setTracked(t), store(t));
  /** Refresh stats; adds a snapshot when the last one is older than 20 h (growth history). */
  const refresh = async (list = tracked) => {
    if (!list.length || !key) return;
    setBusy(true);
    try {
      const chans = await channelsById(list.map((t) => t.id));
      const next = new Map(info);
      for (const ch of chans) next.set(ch.id, { ch, uploads: await latestUploads(ch, 30) });
      setInfo(next);
      save(list.map((t) => {
        const ch = chans.find((c) => c.id === t.id);
        const last = t.snaps[t.snaps.length - 1];
        if (!ch || (last && Date.now() - last.t < 20 * 3600_000)) return t;
        return { ...t, snaps: [...t.snaps, { t: Date.now(), subs: ch.subs, views: ch.views, videos: ch.videos }].slice(-120) };
      }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => void refresh(), [key]);

  const add = async () => {
    setBusy(true);
    try {
      const ch = await resolveChannel(input);
      if (tracked.some((t) => t.id === ch.id)) return toast('Already tracked', 'info');
      const next = [...tracked, { id: ch.id, snaps: [] }];
      setInput('');
      await refresh(next);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      {!key && <NeedKey onSetup={onSetup} />}
      <div className="row between">
        <h3>Competitors</h3>
        <button className="btn sm ghost" disabled={busy || !tracked.length} onClick={() => refresh()}><Icon name="undo" /> Refresh</button>
      </div>
      <p className="hint">Track channels in your niche: upload rhythm, recent views, growth over time (a snapshot is saved each day you open this) and estimated earnings.</p>
      <div className="row">
        <input value={input} placeholder="@handle, channel URL or ID" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && input.trim() && add()} />
        <button className="btn primary" disabled={busy || !input.trim() || !key} onClick={add}><Icon name="plus" /> Track</button>
      </div>
      {tracked.map((t) => {
        const d = info.get(t.id);
        if (!d) return <p key={t.id} className="hint">Loading {t.id}…</p>;
        const pulse = channelPulse(d.uploads);
        const mv = monthlyViews(t, d.uploads);
        const niche = nicheById(t.niche);
        const [lo, hi] = niche ? earnings(mv.value * (1 - pulse.shortsShare * 0.8), niche.rpm) : [0, 0];
        const first = t.snaps[0];
        const subsGrowth = first ? d.ch.subs - first.subs : 0;
        return (
          <div key={t.id} className="comp">
            <div className="row between">
              <a className="row" href={`https://www.youtube.com/channel/${t.id}`} target="_blank" rel="noreferrer">
                {d.ch.thumb && <img className="avatar" src={d.ch.thumb} alt="" />}
                <b>{d.ch.title}</b> <span className="hint">{d.ch.handle}</span>
              </a>
              <div className="row">
                <select value={t.niche ?? ''} onChange={(e) => save(tracked.map((x) => (x.id === t.id ? { ...x, niche: e.target.value || undefined } : x)))} title="Niche (for the RPM estimate)">
                  <option value="">Niche…</option>
                  {NICHES.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                <button className="icon-btn" title="Stop tracking" onClick={() => save(tracked.filter((x) => x.id !== t.id))}><Icon name="trash" /></button>
              </div>
            </div>
            <div className="stats">
              <Stat label="Subscribers" value={compact(d.ch.subs)} sub={first && t.snaps.length > 1 ? `${subsGrowth >= 0 ? '+' : ''}${compact(subsGrowth)} since ${new Date(first.t).toLocaleDateString()}` : 'tracking started'} />
              <Stat label="Uploads / week" value={pulse.perWeek} sub={`${Math.round(pulse.shortsShare * 100)}% Shorts`} />
              <Stat label="Avg views (last 10)" value={compact(pulse.avgViewsLast10)} sub={`median ${compact(pulse.medianViewsLast10)}`} />
              <Stat label="Views / month" value={compact(mv.value)} sub={mv.from === 'history' ? 'from daily snapshots' : 'from last 30 days of uploads'} />
              <Stat label="Est. earnings / month" value={niche ? `${money(lo)}–${money(hi)}` : '—'} sub={niche ? `RPM $${niche.rpm[0]}–${niche.rpm[1]} · estimate` : 'pick a niche'} />
            </div>
            <button className="link" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Hide' : 'Show'} top recent videos</button>
            {open === t.id && pulse.top.map((v) => <VideoRow key={v.id} v={v} subs={d.ch.subs} />)}
          </div>
        );
      })}
      {!tracked.length && <p className="hint">No channels yet — add 3–5 channels you'd like to compete with.</p>}
    </div>
  );
}
