import type { ReactNode } from 'react';
import { ageDays, outlierScore, type Video } from '../lib/youtube';
import { compact } from '../lib/growth';
import { fmtTime } from '../lib/util';

export const ytUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'mid' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="hint">{label}</span>
      <b>{value}</b>
      {sub && <span className="hint">{sub}</span>}
    </div>
  );
}

export function Meter({ label, value, goal, fmt = compact }: { label: string; value: number; goal: number; fmt?: (n: number) => string }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div className="meter">
      <div className="row between"><span>{label}</span><span className="hint">{fmt(value)} / {fmt(goal)}</span></div>
      <div className="bar"><i style={{ width: `${pct}%` }} className={pct >= 100 ? 'done' : ''} /></div>
    </div>
  );
}

export const toneOf = (score: number) => (score >= 70 ? 'good' : score >= 45 ? 'mid' : 'bad');

/** One video row with thumbnail and stats; `subs` adds the outlier multiple. */
export function VideoRow({ v, subs, actions }: { v: Video; subs?: number; actions?: ReactNode }) {
  const ratio = subs !== undefined ? outlierScore(v.views, subs) : undefined;
  return (
    <div className="vrow">
      <a href={ytUrl(v.id)} target="_blank" rel="noreferrer" className="vthumb">
        {v.thumb ? <img src={v.thumb} alt="" loading="lazy" /> : null}
        {v.duration > 0 && <span>{fmtTime(v.duration, false)}</span>}
      </a>
      <div className="vmeta">
        <a href={ytUrl(v.id)} target="_blank" rel="noreferrer"><b>{v.title}</b></a>
        <span className="hint">{v.channelTitle}{subs !== undefined ? ` · ${compact(subs)} subs` : ''} · {compact(v.views)} views · {Math.round(ageDays(v.publishedAt))} days ago</span>
      </div>
      {ratio !== undefined && <span className={`chip outlier ${ratio >= 10 ? 'hot' : ratio >= 3 ? 'warm' : ''}`} title="Views ÷ channel subscribers">×{ratio}</span>}
      {actions}
    </div>
  );
}

export function NeedKey({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="card notice">
      <b>Add your free YouTube API key first</b>
      <p className="hint">Keyword research, outliers and competitors read public YouTube data with your own key (about 100 keyword checks a day, free).</p>
      <button className="btn primary sm" onClick={onSetup}>Open Setup</button>
    </div>
  );
}
