import { useState } from 'react';
import { analytics, googleAvailable, latestUploads, myChannel, videosById, type Channel, type Video } from '../lib/youtube';
import { YPP, compact } from '../lib/growth';
import { chat, useLlm } from '../lib/llm';
import { handOff } from '../tools/PromptStudio';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { Meter, Stat, VideoRow } from './shared';
import { useGoogleStatus } from './SetupTab';

const day = (offset: number) => new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);

interface Report {
  ch: Channel;
  views12m: number;
  hours12m: number;
  subsNet12m: number;
  shorts90: number | null;
  uploads90: number;
  daily: { day: string; views: number; minutes: number; avd: number; subs: number }[];
  sources: [string, number][];
  top: { v: Video; views: number; avp: number }[];
}

export function ChannelTab({ onSetup }: { onSetup: () => void }) {
  const { status } = useGoogleStatus();
  const llm = useLlm((s) => s.status);
  const [r, setR] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [tips, setTips] = useState('');

  const load = async () => {
    setBusy(true);
    try {
      const ch = await myChannel();
      const end = day(0);
      const year = await analytics({ metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost', startDate: day(365), endDate: end });
      const [v, m, g, l] = (year.rows?.[0] ?? [0, 0, 0, 0]).map(Number);
      const d = await analytics({ metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained', dimensions: 'day', sort: 'day', startDate: day(28), endDate: end });
      let shorts90: number | null = null;
      try {
        const s = await analytics({ metrics: 'views', dimensions: 'creatorContentType', startDate: day(90), endDate: end });
        shorts90 = Number(s.rows?.find((row) => String(row[0]).toUpperCase() === 'SHORTS')?.[1] ?? 0);
      } catch {
        /* older API projects may not support this dimension */
      }
      const src = await analytics({ metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views', startDate: day(28), endDate: end }).catch(() => ({ rows: [] }));
      const topR = await analytics({ metrics: 'views,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: 10, startDate: day(90), endDate: end });
      const ids = (topR.rows ?? []).map((row) => String(row[0]));
      const vids = ids.length ? await videosById(ids, true) : [];
      const uploads = await latestUploads(ch, 50, true);
      setR({
        ch, views12m: v, hours12m: m / 60, subsNet12m: g - l, shorts90,
        uploads90: uploads.filter((u) => Date.now() - Date.parse(u.publishedAt) < 90 * 86400_000).length,
        daily: (d.rows ?? []).map((row) => ({ day: String(row[0]), views: +row[1], minutes: +row[2], avd: +row[3], subs: +row[4] })),
        sources: (src.rows ?? []).map((row) => [String(row[0]), +row[1]] as [string, number]),
        top: (topR.rows ?? []).map((row) => ({ v: vids.find((x) => x.id === row[0])!, views: +row[1], avp: +row[2] })).filter((x) => x.v),
      });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const summary = () => r && [
    `Channel: ${r.ch.title} (${r.ch.subs} subscribers, ${r.ch.videos} videos).`,
    `Last 12 months: ${Math.round(r.views12m)} views, ${Math.round(r.hours12m)} watch hours, net ${r.subsNet12m} subscribers.`,
    `Uploads in the last 90 days: ${r.uploads90}.${r.shorts90 !== null ? ` Shorts views (90 days): ${r.shorts90}.` : ''}`,
    `Last 28 days: ${r.daily.reduce((a, x) => a + x.views, 0)} views, average view duration ${Math.round(r.daily.reduce((a, x) => a + x.avd, 0) / Math.max(1, r.daily.length))} s.`,
    `Traffic sources (28 days): ${r.sources.map(([s, n]) => `${s} ${n}`).join(', ') || 'n/a'}.`,
    `Top videos (90 days): ${r.top.map((t) => `"${t.v.title}" ${t.views} views, ${Math.round(t.avp)}% watched`).join('; ')}.`,
  ].join('\n');
  const tipsPrompt = () => `I run a faceless YouTube channel and want to reach the YouTube Partner Program. Here are my real stats:\n\n${summary()}\n\nAnalyse them like a YouTube growth strategist. Give me: 1) the 3 biggest problems holding the channel back, 2) what is working and how to double down, 3) a concrete plan for the next 30 days (topics, titles, upload rhythm, Shorts vs long-form), 4) how long it will take to reach 1,000 subscribers and 4,000 watch hours at this pace, and what would speed it up.`;
  const localTips = async () => {
    setTips('Thinking…');
    try {
      setTips(await chat([{ role: 'user', content: tipsPrompt() }], { maxTokens: 1200, temperature: 0.6 }));
    } catch (e) {
      setTips((e as Error).message);
    }
  };

  if (!googleAvailable()) return <div className="card"><p className="warn">“My channel” needs Google sign-in, which works in the desktop app.</p></div>;
  if (status && !status.signedIn) {
    return (
      <div className="card notice">
        <b>Sign in with Google to see your channel</b>
        <p className="hint">Watch hours, Partner Program progress, top videos and traffic sources come from YouTube Analytics (private data).</p>
        <button className="btn primary sm" onClick={onSetup}>Open Setup</button>
      </div>
    );
  }
  const views28 = r ? r.daily.reduce((a, x) => a + x.views, 0) : 0;
  const maxDay = r ? Math.max(1, ...r.daily.map((x) => x.views)) : 1;
  return (
    <div className="growth-grid">
      <div className="card">
        <div className="row between">
          <h3>{r ? r.ch.title : 'My channel'}</h3>
          <button className="btn sm primary" disabled={busy} onClick={load}><Icon name="undo" /> {busy ? 'Loading…' : r ? 'Refresh' : 'Load my channel'}</button>
        </div>
        {r && (
          <>
            <div className="stats">
              <Stat label="Subscribers" value={compact(r.ch.subs)} sub={`${r.subsNet12m >= 0 ? '+' : ''}${compact(r.subsNet12m)} in 12 months`} />
              <Stat label="Watch hours (12 m)" value={compact(r.hours12m)} sub="all views (approximate)" />
              <Stat label="Views (28 days)" value={compact(views28)} />
              <Stat label="Uploads (90 days)" value={r.uploads90} />
            </div>
            <h4>Partner Program progress</h4>
            <p className="hint">Targets as published by YouTube (check its help page — they can change). Watch hours here include all views; YouTube counts public videos only.</p>
            <Meter label="Subscribers — fan funding (500)" value={r.ch.subs} goal={YPP.fanFunding.subs} />
            <Meter label="Subscribers — ads (1,000)" value={r.ch.subs} goal={YPP.ads.subs} />
            <Meter label="Watch hours, 12 months — ads (4,000)" value={r.hours12m} goal={YPP.ads.watchHours12m} />
            {r.shorts90 !== null && <Meter label="…or Shorts views, 90 days — ads (10M)" value={r.shorts90} goal={YPP.ads.shortsViews90d} />}
            <Meter label="Public uploads, 90 days — fan funding (3)" value={r.uploads90} goal={YPP.fanFunding.uploads90d} fmt={String} />
            <h4>Daily views (28 days)</h4>
            <div className="spark">{r.daily.map((x) => <i key={x.day} style={{ height: `${(x.views / maxDay) * 100}%` }} title={`${x.day}: ${x.views} views`} />)}</div>
            {r.sources.length > 0 && <p className="hint">Traffic: {r.sources.slice(0, 5).map(([s, n]) => `${s.toLowerCase().replace(/_/g, ' ')} ${Math.round((n / Math.max(1, views28)) * 100)}%`).join(' · ')}</p>}
          </>
        )}
      </div>
      <div className="card">
        {r && (
          <>
            <h3>Growth tips</h3>
            <div className="row wrap">
              <button className="btn sm" disabled={llm !== 'ready'} onClick={localTips} title={llm !== 'ready' ? 'Connect the AI assistant in the top bar' : ''}><Icon name="wand" /> Tips from my AI assistant</button>
              <button className="btn sm" onClick={() => void handOff(tipsPrompt(), 'claude')}><Icon name="link" /> Ask Claude</button>
              <button className="btn sm ghost" onClick={() => void handOff(tipsPrompt(), 'gemini')}><Icon name="link" /> Ask Gemini</button>
            </div>
            {tips && <pre className="meta-out">{tips}</pre>}
            <h4>Top videos (90 days)</h4>
            {r.top.map((t) => <VideoRow key={t.v.id} v={{ ...t.v, views: t.views }} actions={<span className="chip" title="Average percentage viewed">{Math.round(t.avp)}% watched</span>} />)}
          </>
        )}
        {!r && <p className="hint">Load your channel to see Partner Program progress and tips.</p>}
      </div>
    </div>
  );
}
