/** Help UI: ? button + help card, guided tours over the real buttons, Help centre, tip toasts, What's new. */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { TOPICS, helpLang, topic, type HelpTopic } from '../help/topics';
import { TIPS, markSeen, setTipsOff, tipsOff, wasSeen } from '../help/tips';
import { WHATS_NEW } from '../help/whatsnew';

declare const __APP_VERSION__: string;
const t2 = (o: { en: string; ar: string } | undefined, lang: 'en' | 'ar') => (o ? (lang === 'ar' && o.ar ? o.ar : o.en) : '');
export const startTour = (id: string) => window.dispatchEvent(new CustomEvent('autostudio:tour', { detail: id }));
export const openHelp = (id?: string) => window.dispatchEvent(new CustomEvent('autostudio:help', { detail: id }));

/** The ? button on a panel / section: opens the help card for its topic. */
export function HelpButton({ topic: id, small }: { topic: string; small?: boolean }) {
  const [at, setAt] = useState<DOMRect | null>(null);
  if (!topic(id)) return null;
  return (
    <>
      <button className={`help-btn ${small ? 'sm' : ''}`} title="How to use this · tips" aria-label="Help" data-help={id}
        onClick={(e) => (e.stopPropagation(), setAt(at ? null : e.currentTarget.getBoundingClientRect()))}>?</button>
      {at && createPortal(<HelpCard id={id} at={at} onClose={() => setAt(null)} />, document.body)}
    </>
  );
}

function TopicBody({ tp, lang }: { tp: HelpTopic; lang: 'en' | 'ar' }) {
  const steps = lang === 'ar' && tp.steps.ar.length ? tp.steps.ar : tp.steps.en;
  const tips = lang === 'ar' && tp.tips.ar.length ? tp.tips.ar : tp.tips.en;
  const probs = lang === 'ar' && tp.problems.ar.length ? tp.problems.ar : tp.problems.en;
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <p className="help-what">{t2(tp.what, lang)}</p>
      {steps.length > 0 && <><h5>{lang === 'ar' ? 'كيف تستخدمه' : 'How to use it'}</h5><ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
      {tips.length > 0 && <><h5>{lang === 'ar' ? 'نصائح وحيل' : 'Tips & tricks'}</h5><ul className="help-tips">{tips.map((s) => <li key={s}>💡 {s}</li>)}</ul></>}
      {probs.length > 0 && <><h5>{lang === 'ar' ? 'مشاكل شائعة' : 'Common problems'}</h5><dl>{probs.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl></>}
    </div>
  );
}

export function HelpCard({ id, at, onClose }: { id: string; at: DOMRect; onClose: () => void }) {
  const tp = topic(id)!;
  const [lang, setLang] = useState(helpLang());
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const left = Math.min(window.innerWidth - 380, Math.max(8, at.left - 160)), top = at.bottom + 8 > window.innerHeight - 420 ? Math.max(8, at.top - 430) : at.bottom + 8;
  return (
    <div className="help-card-bg" onClick={onClose}>
      <div className="help-card" style={{ left, top }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Help: ${tp.title.en}`}>
        <div className="row between"><b>{t2(tp.title, lang)}</b>
          <span className="row"><button className="link" onClick={() => (localStorage.setItem('helpLang', lang === 'ar' ? 'en' : 'ar'), setLang(lang === 'ar' ? 'en' : 'ar'))}>{lang === 'ar' ? 'English' : 'عربي'}</button><button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button></span>
        </div>
        <TopicBody tp={tp} lang={lang} />
        <div className="row wrap">
          {tp.tour && <button className="btn sm primary" onClick={() => (onClose(), startTour(tp.id))}><Icon name="play" /> {lang === 'ar' ? 'أرني كيف' : 'Show me how'}</button>}
          <button className="btn sm ghost" onClick={() => (onClose(), openHelp(tp.id))}>{lang === 'ar' ? 'كل المساعدة' : 'All help'}</button>
        </div>
      </div>
    </div>
  );
}

/** Spotlight tour over the real buttons (`data-tour` attributes). */
export function Tour() {
  const [id, setId] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const lang = helpLang();
  useEffect(() => {
    const h = (e: Event) => (setId((e as CustomEvent<string>).detail), setI(0));
    window.addEventListener('autostudio:tour', h);
    return () => window.removeEventListener('autostudio:tour', h);
  }, []);
  const steps = (id && topic(id)?.tour) || [];
  const step = steps[i];
  useLayoutEffect(() => {
    if (!step) return setRect(null);
    const find = () => setRect(document.querySelector(step.sel)?.getBoundingClientRect() ?? null);
    find();
    const iv = setInterval(find, 400);
    return () => clearInterval(iv);
  }, [step]);
  if (!id || !step) return null;
  const end = () => (markSeen(`tour:${id}`), setId(null));
  const r = rect ?? new DOMRect(window.innerWidth / 2 - 100, window.innerHeight / 2 - 30, 200, 60);
  const boxTop = r.bottom + 160 > window.innerHeight ? Math.max(8, r.top - 150) : r.bottom + 12;
  return (
    <div className="tour" data-tour-step={i}>
      <div className="tour-hole" style={{ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }} />
      <div className="tour-box" style={{ left: Math.min(window.innerWidth - 340, Math.max(8, r.left)), top: boxTop }} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <p>{lang === 'ar' ? step.ar : step.en}</p>
        <div className="row between">
          <span className="hint">{i + 1} / {steps.length}</span>
          <span className="row">
            <button className="btn sm ghost" onClick={end}>{lang === 'ar' ? 'تخطي' : 'Skip'}</button>
            {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>{lang === 'ar' ? 'رجوع' : 'Back'}</button>}
            <button className="btn sm primary" data-tour-next onClick={() => (i + 1 < steps.length ? setI(i + 1) : end())}>{i + 1 < steps.length ? (lang === 'ar' ? 'التالي' : 'Next') : lang === 'ar' ? 'تم' : 'Done'}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
/** Run a feature's tour the first time it opens. */
export function useFirstTour(id: string, when = true) {
  useEffect(() => {
    if (!when || wasSeen(`tour:${id}`) || localStorage.getItem('help:noTours') === '1') return;
    const t = setTimeout(() => startTour(id), 700);
    return () => clearTimeout(t);
  }, [id, when]);
}

/** Help centre: searchable list of every topic (English / Arabic) and the keyboard shortcuts. */
export function HelpCenter() {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState(helpLang());
  useEffect(() => {
    const h = (e: Event) => setOpen((e as CustomEvent<string | undefined>).detail ?? '');
    window.addEventListener('autostudio:help', h);
    return () => window.removeEventListener('autostudio:help', h);
  }, []);
  const list = useMemo(() => TOPICS.filter((t) => !q || JSON.stringify(t).toLowerCase().includes(q.toLowerCase())), [q]);
  if (open === null) return null;
  const sel = topic(open) ?? list[0];
  return (
    <div className="modal-bg" onClick={() => setOpen(null)}>
      <div className="modal wide help-center" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>{lang === 'ar' ? 'المساعدة' : 'Help'}</h3>
          <span className="row">
            <button className="link" onClick={() => (localStorage.setItem('helpLang', lang === 'ar' ? 'en' : 'ar'), setLang(lang === 'ar' ? 'en' : 'ar'))}>{lang === 'ar' ? 'English' : 'عربي'}</button>
            <label className="row hint"><input type="checkbox" checked={tipsOff()} onChange={(e) => setTipsOff(e.target.checked)} /> {lang === 'ar' ? 'لا تعرض النصائح' : "Don't show tips"}</label>
            <button className="icon-btn" onClick={() => setOpen(null)}><Icon name="x" /></button>
          </span>
        </div>
        <div className="help-cols">
          <nav>
            <input placeholder={lang === 'ar' ? 'ابحث…' : 'Search help…'} value={q} onChange={(e) => setQ(e.target.value)} />
            {[...new Set(list.map((t) => t.group))].map((g) => (
              <div key={g}><h5>{g}</h5>{list.filter((t) => t.group === g).map((t) => <button key={t.id} className={`link ${sel?.id === t.id ? 'on' : ''}`} onClick={() => setOpen(t.id)}>{t2(t.title, lang)}</button>)}</div>
            ))}
            <div><h5>{lang === 'ar' ? 'الاختصارات' : 'Shortcuts'}</h5><button className="link" onClick={() => (setOpen(null), window.dispatchEvent(new CustomEvent('autostudio:dialog', { detail: 'keys' })))}>{lang === 'ar' ? 'كل الاختصارات' : 'All keyboard shortcuts'}</button></div>
          </nav>
          {sel && (
            <article>
              <h4>{t2(sel.title, lang)}</h4>
              <TopicBody tp={sel} lang={lang} />
              {sel.tour && <button className="btn sm primary" onClick={() => (setOpen(null), startTour(sel.id))}><Icon name="play" /> {lang === 'ar' ? 'أرني كيف' : 'Show me how'}</button>}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

/** One small dismissible tip at the right moment. */
export function TipToast() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener('autostudio:tip', h);
    return () => window.removeEventListener('autostudio:tip', h);
  }, []);
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => setId(null), 12000);
    return () => clearTimeout(t);
  }, [id]);
  if (!id || !TIPS[id]) return null;
  const lang = helpLang();
  return (
    <div className="tip-toast" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <span>💡 {lang === 'ar' ? TIPS[id].ar : TIPS[id].en}</span>
      <button className="link" onClick={() => setId(null)}>{lang === 'ar' ? 'حسنًا' : 'Got it'}</button>
      <button className="link" onClick={() => (setTipsOff(true), setId(null))}>{lang === 'ar' ? 'لا نصائح' : 'No more tips'}</button>
    </div>
  );
}

/** What's new after an update (once per version). */
export function WhatsNew() {
  const v = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  const news = WHATS_NEW.find((n) => v.startsWith(n.version.split('.').slice(0, 2).join('.')));
  const [show, setShow] = useState(() => !!news && !wasSeen(`news:${news.version}`) && localStorage.getItem('help:noNews') !== '1');
  if (!show || !news) return null;
  const close = () => (markSeen(`news:${news.version}`), setShow(false));
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal whats-new" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>What’s new in {news.version}</h3><button className="icon-btn" onClick={close}><Icon name="x" /></button></div>
        <div className="news-grid">
          {news.items.map((n) => (
            <div key={n.title} className="news-card"><b>{n.title}</b><p>{n.text}</p>{n.tryIt && <button className="btn sm" onClick={() => (close(), window.dispatchEvent(new CustomEvent(n.tryIt!.event, { detail: n.tryIt!.detail })))}>Try it</button>}</div>
          ))}
        </div>
        <button className="btn primary" onClick={close}>Got it</button>
      </div>
    </div>
  );
}
