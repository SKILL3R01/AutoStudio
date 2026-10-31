import { useState } from 'react';
import { ToolPage, Activity, useJob } from './common';
import { FilePick, Select, Slider, Toggle } from '../components/ui';
import { fetchResult } from '../lib/engine';
import { STYLE_PRESETS, createProject, splitScenes, stampName, buildPrompt } from '../lib/scenes';
import { TTS_LANGS, TtsSettings, defaultTts, ttsForm } from './Voiceover';
import { transcribeForm } from './Transcript';
import { imageForm, type GenAspect } from './ImageGen';
import { navigate } from '../App';
import type { Word } from '../types';

export function AutoVideo() {
  const [title, setTitle] = useState('My faceless video');
  const [script, setScript] = useState('');
  const [voice, setVoice] = useState<File | null>(null);
  const [tts, setTts] = useState(defaultTts);
  const [style, setStyle] = useState(STYLE_PRESETS[0][0]);
  const [character, setCharacter] = useState('');
  const [scene, setScene] = useState(5);
  const [aspect, setAspect] = useState<GenAspect>('16:9');
  const [smart, setSmart] = useState(true);
  const [step, setStep] = useState('');
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState(2);
  const job = useJob();

  const writeScript = async () => {
    const f = new FormData();
    f.append('topic', topic);
    f.append('minutes', String(minutes));
    f.append('language', TTS_LANGS.find(([c]) => c === tts.language)?.[1] ?? 'English');
    try {
      const j = await job.run('script', f);
      setScript(j.data.script);
    } catch (e) {
      job.log(`✗ ${(e as Error).message}`);
    }
  };

  const go = async () => {
    const log: string[] = [];
    const stage = (s: string) => (setStep(s), log.push(`── ${s}`));
    try {
      stage('1/4 Generating voiceover');
      const vj = await job.run('tts', ttsForm(script, voice, tts), [...log]);
      log.push(...vj.logs.slice(-3));
      const voiceBlob = await fetchResult(vj.files[0].url);

      stage('2/4 Transcribing to word-level captions');
      const tj = await job.run('transcribe', transcribeForm(voiceBlob, 'voiceover.wav', tts.language, 'large-v3'), [...log]);
      const words: Word[] = tj.data.words;
      log.push(`${words.length} words`);

      stage('3/4 Generating scene images');
      const scenes = splitScenes(words, scene);
      const items = scenes.map((s, i) => ({ prompt: smart ? s.text : buildPrompt(style, character, s.text), name: stampName(i === 0 ? 0 : s.start, 'png'), t: i === 0 ? 0 : s.start }));
      log.push(`${scenes.length} scenes`);
      const ij = await job.run('imagegen', imageForm(items, { aspect, model: 'lightning', steps: 4, seed: 0, smart, style, character }), [...log]);

      stage('4/4 Building the edit');
      job.setLogs([...log, 'Downloading images…']);
      const images = await Promise.all(ij.files.map(async (f) => ({ blob: await fetchResult(f.url), name: f.name, t: items.find((x) => x.name === f.name)?.t ?? 0 })));
      const p = await createProject({ name: title, voice: voiceBlob, images, words, aspect });
      navigate({ page: 'editor', id: p.id });
    } catch (e) {
      job.log(`✗ ${(e as Error).message}`);
    } finally {
      setStep('');
    }
  };

  return (
    <ToolPage
      title="Script → Video"
      subtitle="Everything in one click: voiceover (with your cloned voice) → word-level transcript → one AI image per scene → a timed edit with motion, transitions and animated captions."
      form={
        <>
          <label className="field"><span>Project name</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="row">
            <label className="field"><span>No script? Topic for the AI writer</span><input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Why we procrastinate and how to stop" /></label>
            <Select label="Minutes" value={minutes} options={[1, 2, 3, 5, 8, 10]} onChange={setMinutes} />
            <button className="btn" disabled={!topic.trim() || job.busy} onClick={writeScript}>✎ Write</button>
          </div>
          <textarea rows={10} value={script} onChange={(e) => setScript(e.target.value)} placeholder="Paste your script…" />
          <FilePick accept="audio/*" onFiles={([f]) => setVoice(f ?? null)} className="drop slim">{voice ? `🎙 ${voice.name}` : '🎙 Optional reference voice to clone'}</FilePick>
          <TtsSettings o={tts} set={setTts} />
          <Select label="Visual style" value={style} options={STYLE_PRESETS} onChange={setStyle} />
          <label className="field"><span>Recurring character</span><input value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Describe your main character once" /></label>
          <div className="row">
            <Select label="Aspect" value={aspect} options={[['16:9', '16:9 YouTube'], ['9:16', '9:16 Shorts'], ['1:1', '1:1']] as [GenAspect, string][]} onChange={setAspect} />
          </div>
          <Slider label="Seconds per scene" value={scene} min={2} max={15} step={0.5} onChange={setScene} suffix="s" />
          <Toggle label="Smart prompts (LLM)" value={smart} onChange={setSmart} />
          <button className="btn primary lg" disabled={!script.trim() || !!step} onClick={go}>{step || 'Create video ✦'}</button>
        </>
      }
      side={<Activity job={job} />}
    />
  );
}
