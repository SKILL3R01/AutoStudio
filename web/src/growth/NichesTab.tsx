import { useState } from 'react';
import { NICHES, SHORTS_RPM, earnings, money } from '../lib/growth';
import { Icon } from '../components/icons';

export function NichesTab({ onResearch, onOutliers }: { onResearch: (q: string) => void; onOutliers: (q: string) => void }) {
  const [views, setViews] = useState(100_000);
  const [sort, setSort] = useState<'rpm' | 'name'>('rpm');
  const list = [...NICHES].sort((a, b) => (sort === 'rpm' ? b.rpm[1] - a.rpm[1] : a.name.localeCompare(b.name)));
  return (
    <div className="card">
      <h3>Niche finder</h3>
      <p className="hint">
        What a niche typically pays per 1,000 long-form views (creator RPM, USD). These are rough public ranges — real RPM depends on viewer country, season, video length and ad suitability.
        Shorts pay much less (≈ ${SHORTS_RPM[0]}–{SHORTS_RPM[1]} per 1,000 views). Pick a niche, then research its keywords and outliers.
      </p>
      <div className="row wrap">
        <label className="inline hint">Earnings for <select value={views} onChange={(e) => setViews(+e.target.value)}>
          {[10_000, 50_000, 100_000, 500_000, 1_000_000].map((v) => <option key={v} value={v}>{v.toLocaleString()} views / month</option>)}
        </select></label>
        <label className="inline hint">Sort <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="rpm">by RPM</option><option value="name">by name</option></select></label>
      </div>
      <table className="niche-table">
        <thead><tr><th>Niche</th><th>RPM</th><th>Faceless</th><th>Est. / month</th><th>Start with</th><th /></tr></thead>
        <tbody>
          {list.map((n) => {
            const [lo, hi] = earnings(views, n.rpm);
            return (
              <tr key={n.id}>
                <td><b>{n.name}</b></td>
                <td>${n.rpm[0]}–{n.rpm[1]}</td>
                <td><span className={`chip ${n.faceless === 'great' ? 'ok' : ''}`}>{n.faceless}</span></td>
                <td>{money(lo)}–{money(hi)}</td>
                <td className="hint">{n.seeds.join(' · ')}</td>
                <td className="row">
                  <button className="btn sm ghost" onClick={() => onResearch(n.seeds[0])} title="Keyword research"><Icon name="list" /></button>
                  <button className="btn sm ghost" onClick={() => onOutliers(n.seeds[0])} title="Outlier videos"><Icon name="bolt" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
