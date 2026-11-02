import { useMemo, useState } from 'react';
import type { FlowScene } from '../types';
import { fmtClock, parseClock, stampFor } from '../lib/timecode';
import { ops, renameItem, statuses, STATUS_LABEL, type ReviewItem, type ReviewStatus } from './review';
import { Icon } from '../components/icons';

function TimeInput({ value, onChange }: { value: number | null; onChange: (t: number | null) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="time-input"
      value={text ?? (value === null ? '' : fmtClock(value))}
      placeholder="m:ss.00 or 00-01-23"
      onFocus={(e) => (setText(e.target.value), e.target.select())}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null) onChange(parseClock(text));
        setText(null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return text === null ? (
    <span className="rt-name" title={`${value} — click to rename`} onClick={() => setText(value)}>{value} <Icon name="text" size={11} className="dim" /></span>
  ) : (
    <input
      className="rt-name-input"
      autoFocus
      value={text}
      onFocus={(e) => e.target.setSelectionRange(0, text.lastIndexOf('.') > 0 ? text.lastIndexOf('.') : text.length)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() && text !== value && onChange(text.trim()), setText(null))}
      onKeyDown={(e) => (e.key === 'Enter' && (e.target as HTMLInputElement).blur(), e.key === 'Escape' && setText(null))}
    />
  );
}

/** Review detected timestamps before building the timeline; supports per-row edits and bulk fixes. */
export function ReviewTable({ items, setItems, length, flowScenes }: { items: ReviewItem[]; setItems: (f: (i: ReviewItem[]) => ReviewItem[]) => void; length: number | null; flowScenes: FlowScene[] }) {
  const st = useMemo(() => statuses(items, length), [items, length]);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const [step, setStep] = useState(3);
  const [delta, setDelta] = useState(0.5);
  const counts = useMemo(() => {
    const c: Partial<Record<ReviewStatus, number>> = {};
    st.forEach((s) => (c[s] = (c[s] ?? 0) + 1));
    return c;
  }, [st]);
  const selected = items.filter((i) => i.selected).length;
  const hasFlow = items.some((i) => i.guess.kind === 'sequence');
  const hasNumbers = items.some((i) => i.guess.kind === 'number');
  const L = length ?? Math.max(items.length * step, 10);
  const shown = items
    .filter((i) => filter === 'all' || !['ok', 'excluded'].includes(st.get(i.id)!))
    .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const set = (id: string, patch: Partial<ReviewItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const issues = (counts.missing ?? 0) + (counts.check ?? 0) + (counts.duplicate ?? 0) + (counts.beyond ?? 0);

  return (
    <div className="review">
      <div className="review-summary">
        <b>{items.length} files</b>
        {(['ok', 'check', 'missing', 'duplicate', 'beyond', 'excluded'] as ReviewStatus[]).map((s) => counts[s] ? <span key={s} className={`st st-${s}`}>{counts[s]} {STATUS_LABEL[s]}</span> : null)}
        <div className="grow" />
        <div className="seg sm">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'issues' ? 'on' : ''} onClick={() => setFilter('issues')}>Issues ({issues})</button>
        </div>
      </div>

      <div className="review-bulk">
        <span className="hint">{selected ? `${selected} selected` : 'Bulk actions apply to all rows (select rows to limit):'}</span>
        <button className="btn sm" onClick={() => setItems((i) => ops.fillMissing(i, L))} title="Place rows without a time between their named neighbours">Fill missing</button>
        <button className="btn sm" onClick={() => setItems((i) => ops.spread(i, L))}>Spread evenly{length ? ' over voiceover' : ''}</button>
        <span className="inline">
          <button className="btn sm" onClick={() => setItems((i) => ops.sequential(i, step))}>Every</button>
          <input type="number" min={0.2} step={0.5} value={step} onChange={(e) => setStep(+e.target.value)} />s
        </span>
        <span className="inline">
          <button className="btn sm" onClick={() => setItems((i) => ops.shift(i, delta))}>Shift</button>
          <input type="number" step={0.1} value={delta} onChange={(e) => setDelta(+e.target.value)} />s
        </span>
        {hasNumbers && <button className="btn sm" onClick={() => setItems(ops.confirmNumbersAsSeconds)}>Numbers are seconds</button>}
        {hasFlow && flowScenes.length > 0 && <button className="btn sm primary" onClick={() => setItems((i) => ops.mapFlow(i, flowScenes))}><Icon name="flow" /> Map Flow files to scenes</button>}
        {hasFlow && <button className="btn sm" onClick={() => setItems(ops.keepOneVariant)}>Keep one variant per prompt</button>}
        <button className="btn sm" onClick={() => setItems((i) => ops.stampNames(i, stampFor))} title="Rename files to mm-ss-cc_name from their times">Rename to timestamps</button>
        <button className="btn sm ghost" onClick={() => setItems((i) => ops.clear(i))}>Clear times</button>
        {selected > 0 && <button className="btn sm ghost danger" onClick={() => setItems(ops.removeSelected)}><Icon name="trash" /> Remove selected</button>}
      </div>

      <div className="review-table">
        <div className="rt-head">
          <input type="checkbox" checked={selected > 0 && selected === items.length} onChange={(e) => setItems((l) => l.map((i) => ({ ...i, selected: e.target.checked })))} />
          <span />
          <span>File</span>
          <span>Detected</span>
          <span>Starts at</span>
          <span>Status</span>
          <span />
        </div>
        {shown.map((i) => {
          const s = st.get(i.id)!;
          return (
            <div key={i.id} className={`rt-row ${i.selected ? 'sel' : ''} ${i.include ? '' : 'off'}`}>
              <input type="checkbox" checked={i.selected} onChange={(e) => set(i.id, { selected: e.target.checked })} />
              {i.kind === 'image' ? <img src={i.url} loading="lazy" alt="" /> : <video src={`${i.url}#t=0.5`} muted preload="metadata" />}
              <NameInput value={i.name} onChange={(name) => setItems((list) => list.map((x) => (x.id === i.id ? renameItem(x, name) : x)))} />
              <span className="hint">{i.guess.label}</span>
              <TimeInput value={i.time} onChange={(t) => set(i.id, { time: t, confirmed: t !== null })} />
              <span className={`st st-${s}`}>{s === 'ok' ? <Icon name="check" size={12} /> : <Icon name="warn" size={12} />} {STATUS_LABEL[s]}</span>
              <span className="rt-actions">
                {s === 'check' && <button className="icon-btn" title="Confirm this time" onClick={() => set(i.id, { confirmed: true })}><Icon name="check" /></button>}
                <button className="icon-btn" title={i.include ? 'Skip this file' : 'Include this file'} onClick={() => set(i.id, { include: !i.include })}><Icon name={i.include ? 'x' : 'plus'} /></button>
                <button className="icon-btn danger" title="Remove from the list" onClick={() => (URL.revokeObjectURL(i.url), setItems((list) => list.filter((x) => x.id !== i.id)))}><Icon name="trash" /></button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const reviewReady = (items: ReviewItem[], length: number | null) => {
  const st = statuses(items, length);
  const included = items.filter((i) => i.include);
  return included.length > 0 && included.every((i) => ['ok', 'beyond'].includes(st.get(i.id)!));
};
