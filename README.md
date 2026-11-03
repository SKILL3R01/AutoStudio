# AutoStudio — free, all-in-one faceless video studio

A rebuild (and upgrade) of the TryAIToday AutoEditor, made only from free tools.

- `web/` — the editor (Vite + React + TypeScript). Rendering, export (WebCodecs via `mediabunny`), depth maps and object selection (transformers.js) all run **in your browser**. Media stays on your device, in IndexedDB.
- `engine/` — the **Google Colab** GPU backend (FastAPI + Cloudflare quick tunnel): voiceover/cloning, transcripts, image generation, upscaling, LLM.

## Install the desktop app (Windows)

Download from the repository's **Releases** page:
- `AutoStudio-Setup-x.y.z.exe` installs the app with Start-menu and desktop shortcuts.
- `AutoStudio-Portable-x.y.z.exe` runs it without installing.

The exes are not code-signed. If SmartScreen warns, click **More info → Run anyway**.

To publish a new version, bump the tag: `git tag v1.0.1 && git push origin v1.0.1`. GitHub Actions builds both exes and attaches them to a new Release. You can also build locally with `cd web && npm run dist`; the output goes to `web/release/`.

## Run the editor from source

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Use Edge or Chrome (WebCodecs/WebGPU). **Projects → Demo project** opens a ready-made example.

## AI back-ends (all optional, all free)

| What | Where | How to connect |
|---|---|---|
| Voice, captions, images, upscaling | Google Colab (T4) | Open `engine/AutoStudio_Engine.ipynb` in Colab → Runtime → T4 GPU → Run all → paste the `trycloudflare.com` URL into **Connect engine** |
| AI assistant (keywords, prompts, auto-edit, scripts) | LM Studio (e.g. Gemma) / Ollama / Colab Qwen | **Connect LLM** → pick a preset → Test. LM Studio: Developer → start server, load a model, turn on **Enable CORS**. Ollama: start with `OLLAMA_ORIGINS=*` |
| Depth maps + click-to-select objects | Your browser (WebGPU, falls back to CPU) | Nothing to set up; models (~50 MB + ~40 MB) download on first use |
| Google Flow images/videos | Your own browser + the TryAIToday Flow Automator extension | **Google Flow bridge** tool (see below) |

If you edit `engine/server.py` or `engine/tts_worker.py`, rebuild the notebook with `python engine/build_notebook.py`.

## Features

| Area | What you get |
|---|---|
| Projects | Gallery with thumbnails, + New project, rename / duplicate / delete, backup & restore (`.autostudio` file), storage usage |
| Import & review | Images, video **and sound files** (each sound gets a type: voiceover / music / sound effect). Detects times in file names (`0-03`, `01-32-420`, `00:03`, `1m32s`, `t=92`, `12.5`, Flow `001_v1`), flags missing / ambiguous / duplicate / after-the-end rows, per-row editing, bulk fixes (fill missing, spread evenly, every N s, shift, numbers-as-seconds, map Flow files to scenes, keep one variant), folder drops |
| Motion | Zoom, pan, tilt, diagonal, drift, breathe, alternate, random, **custom framing** (start → end zoom/position), per-clip strength / easing / reverse, plus **3D depth motion** (push-in, orbit, dolly zoom) from in-browser Depth Anything maps |
| Animate a detail | Click on part of an image (SlimSAM) and make it sway, ripple, glow, flicker, shimmer, cycle hue, blink, sparkle or pop — always, on music beats, or on keywords |
| Transitions | 14 transitions + random, auto-whoosh on every cut |
| Captions | 20 animated word-level styles, Arabic/Urdu fonts and RTL, SRT/VTT/JSON import/export, typo editor |
| **Kinetic typography** | Phrases from your transcript are laid out artistically and revealed word by word with the voice.<br>Templates: stack, stack + vertical side word, mixed weights / outline, script + caps, single punch, random.<br>Artistic font pairs (League Spartan, Archivo Black, Oswald, Pacifico, Dancing Script, Caveat Brush, Arabic) and palettes, with card or full-frame backgrounds.<br>Pick phrases automatically, with the AI, or by clicking words.<br>Animation: entrance (pop, slam, slide, drop, zoom, fade, hand-drawn reveal, typewriter) per block or per word, exit, speed and word rhythm. |
| Start & end | Intro before the narration (drag the voice lane), outro after it (drag the ◀▶ end handle), blank / colour sections, master audio fade in/out |
| Timeline transitions | Every cut shows its transition; click to change it |
| Engine setup | One-click **Open in Colab**; the notebook's **Open desktop app & connect** button connects AutoStudio automatically |
| **Keyword captions** (legacy) | Keywords only / subtitles / both. Auto-pick or AI-pick keywords; font combinations, colour palettes, placement (safe zones / random / grid), 9 animations (pop, slam, typewriter, slide, rotate, glow, draw, split, marker), 🎲 randomize, drag on the preview, lock, per-keyword editing, K lane on the timeline |
| Overlays | Titles, lower thirds, call-to-action, logo/watermark images; drag on the preview |
| Audio | Voiceover, **remove silences** (detect → listen → approve → cut; everything stays in sync, Undo restores), music with fades, **ducking from the voice itself** (dips while speaking, rises in pauses; level / dip / release controls) and loop-to-fill, 14 synthesized SFX + your own, video clip sound with trim in/out and loop |
| Effects | Grain, VHS, CRT, glitch, light leak, vignette, snow, dust, rain, embers, bokeh, cinematic (stackable) — each on the whole video, a time range or chosen clips, with fades |
| Editor UI | Resizable / collapsible panels and timeline, Settings (performance profile from your hardware, layout reset, version), icon rail + panels, large preview with safe-area guides, direct drag and resize/rotate handles, Properties panel, media bin, resizable virtualized timeline, Shift-click multi-select, undo/redo, toasts, shortcuts (`?`) |
| AI assistant | Auto-edit (motion/transition/SFX per scene), proofread captions, titles/description/hashtags, keyword picking, Flow/image prompt writing |
| Export | Presets (YouTube, Shorts/TikTok/Reels, Instagram, Square, Draft), 1080p/720p/480p, 24–60 fps, explicit bitrates (8/5/2.5 Mbps), MP4 or WebM, audio-only WAV, SRT |
| Google Flow bridge | Scenes from your transcript → prompts (optionally LLM-written) → `flow_prompts.txt` in the extension's format + `scenes.json` → run the extension → drop its `001_v1…` downloads back and they land on their scenes |
| Colab engine | Chatterbox (English / Turbo / Multilingual V3) + voice cloning, faster-whisper, SDXL-Lightning / SDXL-Turbo, Qwen2.5 (script / prompts / chat), Real-ESRGAN image & video |

About Google Flow: AutoStudio does not log into Google, automate Flow's private API, or remove watermarks. Generation happens in your own browser through the extension; the bridge only prepares prompts and maps the downloaded files.

Licence notes for personal use: SDXL-Turbo is non-commercial. SDXL-Lightning, Chatterbox, Whisper, Qwen2.5, Depth Anything V2 small, SlimSAM and Real-ESRGAN are permissive.
