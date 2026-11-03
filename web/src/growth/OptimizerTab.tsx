import { useState } from 'react';
import { googleAvailable, latestUploads, myChannel, seoChecks, updateVideoSnippet, type Video } from '../lib/youtube';
import { chatJson, useLlm } from '../lib/llm';
import { handOff } from '../tools/PromptStudio';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { VideoRow, toneOf } from './shared';
import { useGoogleStatus } from './SetupTab';

const KW_KEY = 'seoKeywords';

/** Your uploads with an SEO score; improve title / description / tags (AI) and apply them to YouTube. */
export function OptimizerTab({ onSetup }: { onSetup: () => void }) {
  const { status } = useGoogleStatus();
  const llm = useLlm((s) => s.status);
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState('');
  const [sel, setSel] = useState<Video | null>(null);
  const [kws, setKws] = useState<Record<string, string>>(() => JSON.parse(localStorage.getItem(KW_KEY) ?? '{}'));
  const [draft, setDraft] = useState({ title: '', description: '', tags: '' });

  const load = async () => {
    setBusy('Loading your videos…');
    try {
      setVideos(await latestUploads(await myChannel(), 50, true));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const pick = (v: Video) => {
    setSel(v);
    setDraft({ title: v.title, description: v.description, tags: v.tags.join(', ') });
  };
  const kw = sel ? kws[sel.id] ?? '' : '';
  const setKw = (k: string) => {
    if (!sel) return;
    const next = { ...kws, [sel.id]: k };
    setKws(next);
    localStorage.setItem(KW_KEY, JSON.stringify(next));
  };
  const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const seo = seoChecks({ title: draft.title, description: draft.description, tags }, kw);
  const changed = sel && (draft.title !== sel.title || draft.description !== sel.description || tags.join(',') !== sel.tags.join(','));

  const prompt = () => `Improve the YouTube SEO of this video${kw ? ` for the search keyword "${kw}"` : ''}. Keep the meaning, language and any links/chapters; don't use clickbait that the video doesn't deliver.

Current title: ${draft.title}
Current description:
${draft.description}
Current tags: ${tags.join(', ')}

Return: a better title (max 70 characters, keyword early), a better description (hook in the first 2 lines with the keyword, a natural summary, chapters if timestamps exist, 3–5 hashtags at the end), and 10–15 tags (broad + long-tail).`;

  const improve = async () => {
    setBusy('Asking the AI assistant…');
    try {
      const r = await chatJson<{ title: string; description: string; tags: string[] }>('You are a YouTube SEO expert. Reply with JSON {"title": string, "description": string, "tags": string[]}.', prompt(), 1600);
      setDraft({ title: r.title ?? draft.title, description: r.description ?? draft.description, tags: (r.tags ?? tags).join(', ') });
      toast('Draft updated — review it, then Apply', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const apply = async () => {
    if (!sel || !confirm(`Update “${sel.title}” on YouTube with the new title, description and tags?`)) return;
    setBusy('Saving to YouTube…');
    try {
      const v = await updateVideoSnippet(sel, { title: draft.title.trim(), description: draft.description, tags });
      const merged = { ...sel, title: v.title || draft.title, description: v.description ?? draft.description, tags: v.tags.length ? v.tags : tags };
      setVideos((list) => list.map((x) => (x.id === sel.id ? merged : x)));
      setSel(merged);
      toast('Updated on YouTube ✓', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (!googleAvailable()) return <div className="card"><p className="warn">The optimizer needs Google sign-in, which works in the desktop app.</p></div>;
  if (status && !status.signedIn) {
    return (
      <div className="card notice">
        <b>Sign in with Google to optimize your videos</b>
        <p className="hint">Reads your uploads and, when you click Apply, updates their title, description and tags.</p>
        <button className="btn primary sm" onClick={onSetup}>Open Setup</button>
      </div>
    );
  }
  return (
    <div className="growth-grid">
      <div className="card">
        <div className="row between">
          <h3>Your videos</h3>
          <button className="btn sm primary" disabled={!!busy} onClick={load}><Icon name="undo" /> {videos.length ? 'Reload' : 'Load my videos'}</button>
        </div>
        {busy && <p className="hint">{busy}</p>}
        {videos.map((v) => {
          const s = seoChecks(v, kws[v.id] ?? '').score;
          return (
            <div key={v.id} className={`opt-row ${sel?.id === v.id ? 'on' : ''}`} onClick={() => pick(v)}>
              <VideoRow v={v} actions={<span className={`score-pill ${toneOf(s)}`} title="SEO score">{s}</span>} />
            </div>
          );
        })}
      </div>
      <div className="card">
        {!sel ? <p className="hint">Pick a video to see its SEO checklist and improve it.</p> : (
          <>
            <div className="row between"><h3>Optimize</h3><span className={`score-pill big ${toneOf(seo.score)}`}>{seo.score}</span></div>
            <label className="field"><span>Target keyword</span><input value={kw} placeholder="what people would search to find this video" onChange={(e) => setKw(e.target.value)} /></label>
            <label className="field"><span>Title ({draft.title.length}/100)</span><input value={draft.title} maxLength={100} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label className="field"><span>Description ({draft.description.length})</span><textarea rows={9} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label className="field"><span>Tags (comma-separated, {draft.tags.length}/500)</span><textarea rows={3} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
            <ul className="checks">
              {seo.checks.map((c) => <li key={c.label} className={c.ok ? 'ok' : 'bad'} title={c.tip}><Icon name={c.ok ? 'check' : 'warn'} size={13} /> {c.label}</li>)}
            </ul>
            <div className="row wrap">
              <button className="btn sm" disabled={llm !== 'ready' || !!busy} onClick={improve} title={llm !== 'ready' ? 'Connect the AI assistant in the top bar' : ''}><Icon name="wand" /> Improve with my AI assistant</button>
              <button className="btn sm" onClick={() => void handOff(prompt(), 'claude')}><Icon name="link" /> Ask Claude</button>
              <button className="btn sm ghost" disabled={!changed} onClick={() => pick(sel)}>Discard changes</button>
              <button className="btn sm primary" disabled={!changed || !!busy || !draft.title.trim()} onClick={apply}><Icon name="upload" /> Apply to YouTube</button>
            </div>
            <p className="hint">Apply uses 50 quota units. Paste Claude's answer back into the fields before applying.</p>
          </>
        )}
      </div>
    </div>
  );
}
