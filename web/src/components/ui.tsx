import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Slider(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string; fmt?: (v: number) => string }) {
  const { label, value, min, max, step = 0.01, onChange, suffix = '', fmt } = props;
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <em>{fmt ? fmt(value) : `${+value.toFixed(2)}${suffix}`}</em>
    </label>
  );
}

export function Seg<T extends string | number>(props: { options: readonly (T | [T, string])[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : ([o, String(o)] as [T, string]);
        return (
          <button key={String(v)} className={v === props.value ? 'on' : ''} onClick={() => props.onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string | number>(props: { label?: string; value: T; options: readonly (T | [T, string])[]; onChange: (v: T) => void }) {
  return (
    <label className="field">
      {props.label && <span>{props.label}</span>}
      <select value={String(props.value)} onChange={(e) => {
        const o = props.options.find((x) => String(Array.isArray(x) ? x[0] : x) === e.target.value)!;
        props.onChange(Array.isArray(o) ? o[0] : (o as T));
      }}>
        {props.options.map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, String(o)];
          return <option key={String(v)} value={String(v)}>{l}</option>;
        })}
      </select>
    </label>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function Section(props: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="section">
      <h4>{props.title}</h4>
      {props.hint && <p className="hint">{props.hint}</p>}
      {props.children}
    </section>
  );
}

export function FilePick(props: { accept: string; multiple?: boolean; directory?: boolean; onFiles: (f: File[]) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`${props.className ?? 'btn'} ${drag ? 'drag' : ''}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDrag(false);
        const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
        props.onFiles(entries.some((x) => x.isDirectory) ? (await Promise.all(entries.map(readEntry))).flat() : [...e.dataTransfer.files]);
      }}
    >
      <input
        ref={ref}
        type="file"
        hidden
        accept={props.accept}
        multiple={props.multiple}
        {...(props.directory ? { webkitdirectory: '' } : {})}
        onChange={(e) => {
          props.onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {props.children}
    </div>
  );
}

/** Recursively collect files from a dropped folder. */
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    all.push(...batch);
  }
  return (await Promise.all(all.map(readEntry))).flat();
}

export function LogBox({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [lines.length]);
  return <pre className="log" ref={ref}>{lines.length ? lines.join('\n') : 'No activity yet.'}</pre>;
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.round(value * 100)}%` }} />
      {label && <span>{label}</span>}
    </div>
  );
}

export function useObjectUrl(blob?: Blob | null) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
