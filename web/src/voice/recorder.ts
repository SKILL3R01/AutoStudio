/** Microphone recorder with a live level meter (browser noise suppression on; no auto-gain, so levels stay honest). */
import { useEffect, useRef, useState } from 'react';

export type RecState = 'idle' | 'countdown' | 'recording' | 'done' | 'error';

export function useRecorder() {
  const [state, setState] = useState<RecState>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const r = useRef<{ stream?: MediaStream; rec?: MediaRecorder; ctx?: AudioContext; raf?: number; t0?: number; chunks: Blob[] }>({ chunks: [] });

  const cleanup = () => {
    const c = r.current;
    if (c.raf) cancelAnimationFrame(c.raf);
    c.stream?.getTracks().forEach((t) => t.stop());
    void c.ctx?.close();
    r.current = { chunks: [] };
    setLevel(0);
  };
  useEffect(() => cleanup, []);

  const start = async (countdown = 3) => {
    setError('');
    setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: false, autoGainControl: false, channelCount: 1 } });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Float32Array(an.fftSize);
      r.current = { stream, ctx, chunks: [] };
      const tick = () => {
        an.getFloatTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        setLevel(peak);
        if (r.current.t0) setElapsed((performance.now() - r.current.t0) / 1000);
        r.current.raf = requestAnimationFrame(tick);
      };
      tick();
      for (let i = countdown; i > 0; i--) {
        setState('countdown');
        setCount(i);
        await new Promise((res) => setTimeout(res, 1000));
        if (!r.current.stream) return;
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
      rec.ondataavailable = (e) => e.data.size && r.current.chunks.push(e.data);
      rec.onstop = () => {
        setBlob(new Blob(r.current.chunks, { type: rec.mimeType || 'audio/webm' }));
        setState('done');
        cleanup();
      };
      r.current.rec = rec;
      r.current.t0 = performance.now();
      setElapsed(0);
      rec.start(250);
      setState('recording');
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Microphone access was blocked — allow it in Windows privacy settings.' : (e as Error).message);
      setState('error');
      cleanup();
    }
  };
  const stop = () => (r.current.rec?.state === 'recording' ? r.current.rec.stop() : (cleanup(), setState('idle')));
  const reset = () => (cleanup(), setBlob(null), setState('idle'));
  return { state, level, elapsed, count, blob, error, start, stop, reset };
}

/** Decode any recorded / uploaded audio into a mono WAV at 24 kHz (what Chatterbox expects for references). */
export async function toMonoWav(blob: Blob, maxSeconds = 30): Promise<{ wav: Blob; buffer: AudioBuffer }> {
  const { encodeWav } = await import('../audio/silence');
  const ctx = new AudioContext();
  const src = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const len = Math.min(src.duration, maxSeconds);
  const off = new OfflineAudioContext(1, Math.ceil(len * 24000), 24000);
  const node = off.createBufferSource();
  node.buffer = src;
  node.connect(off.destination);
  node.start(0, 0, len);
  const buffer = await off.startRendering();
  return { wav: encodeWav(buffer), buffer };
}
