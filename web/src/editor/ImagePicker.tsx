import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import { downloadStock, rankStock, searchStock, stockQueries, type StockHit } from '../lib/stockimages';
import { clipEmbedImages } from '../ai/vision';
import { queryVector } from '../lib/mediasearch';
import { probe } from '../lib/project';
import { FilePick } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { HelpButton } from '../components/HelpButton';
import { useThumb } from './hooks';

const embed = { text: queryVector, images: clipEmbedImages };
/** Search, then rank with on-device CLIP (skipped quietly if the model can't load, e.g. offline). */
async function findImages(text: string, rank = true): Promise<{ hits: StockHit[]; errors: string[] }> {
  let res = { hits: [] as StockHit[], errors: [] as string[] };
  for (const q of stockQueries(text).length ? stockQueries(text) : [text]) {
    const r = await searchStock(q);
    res = { hits: [...res.hits, ...r.hits.filter((h) => !res.hits.some((x) => x.key === h.key))], errors: r.errors };
    if (res.hits.length >= 6) break;
  }
  if (rank && res.hits.length && localStorage.getItem('stockRank') !== '0') {
    try {
      res.hits = await rankStock(res.hits.slice(0, 24), text, embed);
    } catch {
      /* keep search order */
    }
  }
  return res;
}

/** Download a hit into Media and return the new asset id. */
async function useHit(hit: StockHit): Promise<string> {
  const a = await downloadStock(hit);
  useEditor.getState().update((d) => void d.assets.push(a));
  return a.id;
}

function HitTile({ hit, busy, onUse }: { hit: StockHit; busy: boolean; onUse: () => void }) {
  return (
    <button className="stock-tile" disabled={busy} onClick={onUse} title={`${hit.title} — ${hit.source} · ${hit.licence}${hit.creator ? ` · ${hit.creator}` : ''}`}>
      <img src={hit.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
      {hit.match !== undefined && hit.match > 0 && <span className="badge">{hit.match}%</span>}
      <span className="name">{hit.source} · {hit.licence}</span>
    </button>
  );
}

function MediaTile({ id, name, onUse }: { id: string; name: string; onUse: () => void }) {
  const thumb = useThumb(id, 'image');
  return <button className="stock-tile" onClick={onUse} title={name}>{thumb && <img src={thumb} alt="" />}<span className="name">Your file</span></button>;
}

interface PickReq { title: string; query: string; onPick: (assetId: string) => void }
export const useImagePicker = create<{ req: PickReq | null; open: (r: PickReq) => void; close: () => void }>((set) => ({ req: null, open: (req) => set({ req }), close: () => set({ req: null }) }));

/** Find a free picture: CC0 / public-domain libraries (ranked by meaning), your Media, or upload. */
export function ImagePicker() {
  const { req, close } = useImagePicker();
  const p = useEditor((s) => s.project);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ hits: StockHit[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState('');
  const search = async (text = q) => {
    if (!text.trim()) return;
    setBusy('search');
    try {
      setRes(await findImages(text));
    } finally {
      setBusy('');
    }
  };
  useEffect(() => {
    setQ(req?.query ?? '');
    setRes(null);
    if (req?.query) void search(req.query);
  }, [req]);
  if (!req || !p) return null;
  const pick = (id: string) => (req.onPick(id), close());
  const mine = p.assets.filter((a) => a.kind === 'image' && !a.name.startsWith('__') && (!q || q.toLowerCase().split(/\s+/).some((w) => w.length > 2 && a.name.toLowerCase().includes(w)))).slice(0, 12);
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal wide image-picker" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>{req.title} <HelpButton topic="stockimages" small /></h3><button className="icon-btn" onClick={close}><Icon name="x" /></button></div>
        <form className="row" onSubmit={(e) => (e.preventDefault(), void search())}>
          <input className="grow" autoFocus value={q} placeholder="Describe the picture: lighthouse in a storm, old map, moon surface…" onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" disabled={!q.trim() || busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
        </form>
        <p className="hint">Free pictures with no watermark, public domain or CC0 only (no credit needed): Openverse, Wikimedia Commons, NASA, The Met, Art Institute of Chicago. Ranked by how well they match your words (on-device AI).</p>
        <div className="stock-grid">
          {res?.hits.map((h) => <HitTile key={h.key} hit={h} busy={!!busy} onUse={async () => {
            setBusy(h.key);
            try {
              pick(await useHit(h));
              toast(`Added “${h.title}” (${h.source}, ${h.licence}) to Media`, 'ok');
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy('');
            }
          }} />)}
        </div>
        {res && !res.hits.length && <p className="hint">Nothing found for “{q}”. Try simpler words (one or two nouns).</p>}
        {res?.errors.map((e) => <p key={e} className="hint warn">{e}</p>)}
        {mine.length > 0 && <><h4>Your pictures</h4><div className="stock-grid">{mine.map((a) => <MediaTile key={a.id} id={a.id} name={a.name} onUse={() => pick(a.id)} />)}</div></>}
        <FilePick className="btn" accept="image/*" onFiles={async ([f]) => {
          if (!f) return;
          const a = await probe(f, f.name, 'image');
          useEditor.getState().update((d) => void d.assets.push(a));
          pick(a.id);
        }}><Icon name="upload" /> Upload a picture…</FilePick>
      </div>
    </div>
  );
}

interface ReviewScene { id: string; text: string }
interface ReviewReq { scenes: ReviewScene[]; onPick: (sceneId: string, assetId: string) => void }
export const useStockReview = create<{ req: ReviewReq | null; open: (r: ReviewReq) => void; close: () => void }>((set) => ({ req: null, open: (req) => set({ req }), close: () => set({ req: null }) }));

/** One row per scene: the 3 best free pictures for its words; Use / Change… / Skip. */
export function StockReview() {
  const { req, close } = useStockReview();
  const [rows, setRows] = useState<Record<string, StockHit[] | 'loading' | 'done' | 'skip'>>({});
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!req) return;
    setRows(Object.fromEntries(req.scenes.map((s) => [s.id, 'loading'])));
    let live = true;
    void (async () => {
      for (const s of req.scenes) {
        const r = await findImages(s.text).catch(() => ({ hits: [] as StockHit[], errors: [] }));
        if (!live) return;
        setRows((cur) => ({ ...cur, [s.id]: r.hits.slice(0, 3) }));
      }
    })();
    return () => void (live = false);
  }, [req]);
  if (!req) return null;
  const done = (id: string, assetId: string) => (req.onPick(id, assetId), setRows((cur) => ({ ...cur, [id]: 'done' })));
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal wide stock-review" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Free pictures for your scenes <HelpButton topic="stockimages" small /></h3><button className="icon-btn" onClick={close}><Icon name="x" /></button></div>
        <p className="hint">The best matches for each scene's words (public domain / CC0, no watermark). Pick one, change the search, or skip.</p>
        <div className="review-rows">
          {req.scenes.map((s) => {
            const r = rows[s.id];
            return (
              <div key={s.id} className="review-row">
                <p className="scene-text">{s.text.slice(0, 120)}</p>
                {r === 'loading' ? <p className="hint">Searching…</p> : r === 'done' ? <p className="hint">✓ Picture set</p> : r === 'skip' ? <p className="hint">Skipped</p> : (
                  <div className="stock-grid small">
                    {(r ?? []).map((h) => <HitTile key={h.key} hit={h} busy={!!busy} onUse={async () => {
                      setBusy(h.key);
                      try {
                        done(s.id, await useHit(h));
                      } catch (e) {
                        toast((e as Error).message, 'error');
                      } finally {
                        setBusy('');
                      }
                    }} />)}
                    {!r?.length && <span className="hint">No match found.</span>}
                  </div>
                )}
                {r !== 'done' && r !== 'skip' && (
                  <div className="row">
                    <button className="btn sm" onClick={() => useImagePicker.getState().open({ title: 'Picture for this scene', query: stockQueries(s.text)[0] ?? s.text, onPick: (id) => done(s.id, id) })}>Change…</button>
                    <button className="btn sm ghost" onClick={() => setRows((cur) => ({ ...cur, [s.id]: 'skip' }))}>Skip</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn primary" onClick={close}>Done</button>
      </div>
    </div>
  );
}
