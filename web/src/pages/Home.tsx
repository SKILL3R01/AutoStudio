import { navigate, type ToolId } from '../App';
import { Icon } from '../components/icons';

const TOOLS: { id: ToolId | 'editor'; icon: string; title: string; desc: string; tag?: string }[] = [
  { id: 'editor', icon: 'film', title: 'Video Editor', desc: 'Assemble images, video, audio, motion, FX and captions — then export.' },
  { id: 'auto', icon: 'bolt', title: 'Script → Video', desc: 'Narrate a script, transcribe it, generate a scene image per line and build the edit — in one click.', tag: 'AI' },
  { id: 'voiceover', icon: 'mic', title: 'AI Voiceover', desc: 'Turn a script into narration, with optional voice cloning, from your Colab.', tag: 'Colab' },
  { id: 'transcript', icon: 'list', title: 'AI Transcript', desc: 'Timecoded lines (control the interval) or word-level captions.', tag: 'Colab' },
  { id: 'images', icon: 'image', title: 'AI Images', desc: 'Storyboard images from prompts with SDXL — named by timestamp, ready for the editor.', tag: 'Colab' },
  { id: 'prompts', icon: 'wand', title: 'Prompt Studio', desc: 'Expert prompts filled with your project — scripts, scene images, thumbnails, SEO — sent to Claude, ChatGPT, Gemini or Flow.', tag: 'Free' },
  { id: 'flow', icon: 'flow', title: 'Google Flow bridge', desc: 'Send scene prompts to the Flow Automator extension and map its downloads back to the timeline.', tag: 'Extension' },
  { id: 'upscale', icon: 'upscale', title: 'Upscaler', desc: 'Upscale images and video clips ×2 / ×4 with Real-ESRGAN.', tag: 'Colab' },
];

export function Home() {
  return (
    <main className="page">
      <div className="hero">
        <h1>Faceless video studio</h1>
        <p className="hint">Script → voiceover → visuals → edit → export. Pick a tool to start.</p>
      </div>
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} className="tool-card" onClick={() => navigate(t.id === 'editor' ? { page: 'projects' } : { page: 'tool', tool: t.id })}>
            <span className="icon"><Icon name={t.icon} size={20} /></span>
            <b>{t.title} {t.tag && <em className="tag">{t.tag}</em>}</b>
            <span>{t.desc}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
