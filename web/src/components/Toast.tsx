import { create } from 'zustand';

interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
}

const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let n = 0;

export function toast(text: string, kind: ToastItem['kind'] = 'info') {
  const id = ++n;
  useToasts.setState((s) => ({ items: [...s.items, { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500);
}

export function Toasts() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toasts">
      {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
