import { useState } from 'react';
import { channelsById, scoreKeyword, searchVideos, suggestions, useYt, type KeywordScore, type Video } from '../lib/youtube';
import { compact } from '../lib/growth';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { navigate } from '../App';
import { NeedKey, Stat, VideoRow, toneOf } from './shared';

interface Saved {
  keyword: string;
  score: number;
  label: string;
  t: number;
}

const SAVED_KEY = 'ytKeywords';

export function KeywordsTab({ seed, onSetup }: { seed?: string; onSetup: () => void }) {
  const key = useYt((s) => s.key);
  const [q, setQ] = useState(seed ?? '');
  const [lang, setLang] = useState('en');
  const [sugg, setSugg] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ keyword: string; score: KeywordScore; videos: Video[]; subs: Map<string, number> } | null>(null);
  const [saved, setSaved] = useState<Saved[]>(() => JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'));

  const suggest = async (expand = false) => {
    if (!q.trim()) return;
    setBusy('Finding what people search…');
    try {
      const base = await suggestions(q, lang);
      let all = base;
      if (expand) {
        // "seed a", "seed b"… — free, but sequential to be polite.
        for (const ch of 'abcdefghijklmnopqrstuvwxyz') all = [...all, ...(await suggestions(`${q} ${ch}`, lang))];
      }
      setSugg([...new Set(all.map((s) => s.toLowerCase()))].filter((s) => s !== q.toLowerCase()).slice(0, 120));
      if (!all.length) toast('No suggestions found', 'info');
    } finally {
      setBusy('');
    }
  };

  const analyze = async (keyword: string) => {
    setBusy(`Analysing “${keyword}” (about 102 quota units)…`);
    try {
      const videos = await searchVideos(keyword, { order: 'relevance', relevanceLanguage: lang, max: 25 });
      const chans = await channelsById(videos.map((v) => v.channelId));
      const subs = new Map(chans.map((c) => [c.id, c.subs]));
      const score = scoreKeyword(videos, (id) => subs.get(id) ?? 0);
      setResult({ keyword, score, videos, subs });
      const next = [{ keyword, score: score.score, label: score.label, t: Date.now() }, ...saved.filter((s) => s.keyword !== keyword)].slice(0, 60);
      setSaved(next);
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toPrompt = (topic: string) => {
    const vars = JSON.parse(localStorage.getItem('promptVars') ?? '{}');
    localStorage.setItem('promptVars', JSON.stringify({ ...vars, topic }));
    navigate({ page: 'tool', tool: 'prompts' });
  };

  return (
    <div className="growth-grid">
      <div className="card">
        <h3>Keyword research</h3>
        <p className="hint">Start with a topic: suggestions come from YouTube's own search box (free). Analyse one to see demand vs competition.</p>
        <div className="row">
          <input value={q} placeholder="e.g. stoic mindset" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && suggest()} />
          <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: 90 }}>
            {['en', 'ar', 'fr', 'es', 'de', 'pt', 'hi', 'ur', 'id', 'tr'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="row wrap">
          <button className="btn sm" disabled={!!busy} onClick={() => suggest()}><Icon name="list" /> Suggestions</button>
          <button className="btn sm ghost" disabled={!!busy} onClick={() => suggest(true)} title="Also tries “topic a… z” — finds long-tail searches">Expand A–Z</button>
          <button className="btn sm primary" disabled={!!busy || !q.trim() || !key} onClick={() => analyze(q.trim())}><Icon name="bolt" /> Analyse “{q.trim() || '…'}”</button>
        </div>
        {busy && <p className="hint">{busy}</p>}
        {sugg.length > 0 && (
          <div className="chips">
            {sugg.map((s) => <button key={s} className="chip" onClick={() => (setQ(s), key && analyze(s))} title="Analyse">{s}</button>)}
          </div>
        )}
        {saved.length > 0 && (
          <>
            <h4>Analysed keywords</h4>
            <div className="saved-list">
              {saved.map((s) => (
                <button key={s.keyword} className="saved" onClick={() => (setQ(s.keyword), analyze(s.keyword))}>
                  <span className={`score-pill ${toneOf(s.score)}`}>{s.score}</span> {s.keyword} <span className="hint">· {s.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        {!key && <NeedKey onSetup={onSetup} />}
        {!result ? <p className="hint">Analyse a keyword to see its score here.</p> : (
          <>
            <div className="row between">
              <h3>“{result.keyword}”</h3>
              <button className="btn sm ghost" onClick={() => toPrompt(result.keyword)}><Icon name="wand" /> Write a script about it</button>
            </div>
            <div className="stats">
              <Stat label="Opportunity" value={<>{result.score.score} <small>{result.score.label}</small></>} tone={toneOf(result.score.score)} />
              <Stat label="Demand" value={result.score.demand} sub={`${compact(result.score.medianViewsPerDay)} views/day (median)`} tone={toneOf(result.score.demand)} />
              <Stat label="Competition" value={result.score.competition} sub={`${compact(result.score.medianSubs)} subs (median channel)`} tone={toneOf(100 - result.score.competition)} />
              <Stat label="Small channels winning" value={result.score.smallChannelWins} sub="< 100K subs with > 50K views" />
              <Stat label="Recent videos" value={`${Math.round(result.score.recentShare * 100)}%`} sub="of top results < 6 months old" />
            </div>
            <p className="hint">Scores are estimates from the top 15 results — YouTube does not publish search volume.</p>
            <h4>Top results</h4>
            {result.videos.slice(0, 15).map((v) => <VideoRow key={v.id} v={v} subs={result.subs.get(v.channelId)} />)}
          </>
        )}
      </div>
    </div>
  );
}
