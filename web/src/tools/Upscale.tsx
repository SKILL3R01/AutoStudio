import { useState } from 'react';
import { ToolPage, Activity, useJob } from './common';
import { FilePick, Seg } from '../components/ui';
import { engineFileUrl, fetchResult } from '../lib/engine';
import { download } from '../lib/util';

export function Upscale() {
  const [files, setFiles] = useState<File[]>([]);
  const [scale, setScale] = useState<2 | 4>(2);
  const [done, setDone] = useState<{ name: string; url: string; video: boolean }[]>([]);
  const job = useJob();
  const go = async () => {
    setDone([]);
    for (const [i, file] of files.entries()) {
      const video = file.type.startsWith('video');
      const f = new FormData();
      f.append('file', file, file.name);
      f.append('scale', String(scale));
      try {
        const j = await job.run(video ? 'video_upscale' : 'upscale', f, [`[${i + 1}/${files.length}] ${file.name}`]);
        setDone((d) => [...d, ...j.files.map((x) => ({ ...x, video }))]);
      } catch (e) {
        job.log(`✗ ${file.name}: ${(e as Error).message}`);
      }
    }
    job.log('✓ All done');
  };
  return (
    <ToolPage
      title="Upscaler"
      subtitle="Sharpen and enlarge storyboard images and video clips with Real-ESRGAN on your Colab GPU."
      form={
        <>
          <FilePick accept="image/*,video/*" multiple onFiles={(f) => setFiles((x) => [...x, ...f])} className="drop">
            <span className="icon">⤢</span>
            <b>{files.length ? `${files.length} files` : 'Drop images or videos'}</b>
            <span>Videos are upscaled frame by frame — keep clips short.</span>
          </FilePick>
          {files.length > 0 && <button className="btn ghost sm" onClick={() => setFiles([])}>Clear list</button>}
          <Seg options={[[2, '×2'], [4, '×4']] as const} value={scale} onChange={setScale} />
          <button className="btn primary lg" disabled={!files.length || job.busy} onClick={go}>{job.busy ? 'Upscaling…' : 'Upscale'}</button>
        </>
      }
      side={
        <Activity job={job}>
          <div className="gallery">
            {done.map((f) => (
              <a key={f.url} onClick={async () => download(await fetchResult(f.url), f.name)} title="Download">
                {f.video ? <video src={engineFileUrl(f.url)} muted /> : <img src={engineFileUrl(f.url)} />}
                <span>⤓ {f.name}</span>
              </a>
            ))}
          </div>
        </Activity>
      }
    />
  );
}
