import { useRef, useState, type ReactNode } from 'react';
import { runJob, useEngine, type EngineTool, type JobState } from '../lib/engine';
import { LogBox, Progress } from '../components/ui';

export function ToolPage(props: { title: string; subtitle: string; form: ReactNode; side: ReactNode; needsEngine?: boolean }) {
  const status = useEngine((s) => s.status);
  return (
    <main className="tool">
      <a className="back" href="#">← Studio</a>
      <h1>{props.title}</h1>
      <p className="hint">{props.subtitle}</p>
      {props.needsEngine !== false && status !== 'ready' && <p className="warn">Engine offline — click <b>Connect engine</b> (top right) and paste your Colab URL.</p>}
      <div className="tool-grid">
        <div className="card">{props.form}</div>
        <div className="card">{props.side}</div>
      </div>
    </main>
  );
}

export function useJob() {
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<JobState>();
  const abort = useRef<AbortController>(null);
  const log = (s: string) => setLogs((l) => [...l, s]);
  const run = async (tool: EngineTool, form: FormData, prefix: string[] = []): Promise<JobState> => {
    abort.current = new AbortController();
    setBusy(true);
    setProgress(0);
    setState(undefined);
    try {
      return await runJob(tool, form, (j) => (setLogs([...prefix, ...j.logs]), setProgress(j.progress), setState(j)), abort.current.signal);
    } finally {
      setBusy(false);
    }
  };
  return { logs, setLogs, log, busy, setBusy, progress, setProgress, state, run, cancel: () => abort.current?.abort() };
}

export function Activity({ job, children }: { job: ReturnType<typeof useJob>; children?: ReactNode }) {
  return (
    <>
      <h4>Activity</h4>
      <LogBox lines={job.logs} />
      {job.busy && (
        <div className="row">
          <Progress value={job.progress} />
          <button className="btn ghost sm" onClick={job.cancel}>Cancel</button>
        </div>
      )}
      {children}
    </>
  );
}
