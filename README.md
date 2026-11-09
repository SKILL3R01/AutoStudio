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

**Updates:** the installed app checks GitHub once a day and shows an **Update** button; Settings → Updates downloads the new version (verified against GitHub's checksum) and restarts into it. The portable exe links to the download page instead.

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
| **Timeline tools** | Split at the playhead (clips, music, text, narration), trim both edges of music/text, ripple delete (close the gap), copy / paste / duplicate, video clip speed (0.25–4×) and sound fades, detach audio to the music lane, snapping (magnet, `N`), narration parts: split the voice, select a part, cut it out (everything after moves with it) |
| Engine setup | Works with **two Colab notebooks**: the AutoStudio engine (one-click **Open in Colab**; its **Open desktop app & connect** button connects automatically) or the **TryAIToday Studio** notebook from the reference site (English voiceover with cloning, Whisper captions, upscaling) — detected automatically from the URL |
| **AI video** | **Animate with AI** on any image clip: Wan 2.1 VACE 1.3B on your Colab turns the still into a 1–5 s video that starts on the same image (or text → video). Free, no watermark; several minutes per clip on a free T4 |
| **Growth** (vidIQ-style) | With a free YouTube API key: **keyword research** (YouTube search suggestions + A–Z expansion, opportunity/demand/competition scores), **outlier videos** (views ÷ channel size), **competitor tracking** (upload rhythm, recent views, daily growth snapshots, estimated earnings), **niche finder** (RPM ranges), quota meter. With Google sign-in (desktop app): **My channel** (watch hours, subscribers, Partner Program progress, daily views, traffic sources, top videos, AI growth tips) and the **Optimizer** (SEO score per video, AI rewrite, apply title/description/tags to YouTube). **Readiness** checks a project against YouTube's monetization policies before upload |
| **Prompt Studio** | 9 expert prompts (script, hook, Flow scene images, Veo video prompts, character sheet, thumbnails, SEO, Shorts, channel plan) filled with your project's transcript/scenes, editable, plus your own templates — sent to Claude / ChatGPT (pre-filled) or Gemini / Google Flow (copied) |
| **Keyword captions** (legacy) | Keywords only / subtitles / both. Auto-pick or AI-pick keywords; font combinations, colour palettes, placement (safe zones / random / grid), 9 animations (pop, slam, typewriter, slide, rotate, glow, draw, split, marker), 🎲 randomize, drag on the preview, lock, per-keyword editing, K lane on the timeline |
| Overlays | Titles, lower thirds, call-to-action, logo/watermark images; drag on the preview |
| Audio | Voiceover, **remove silences** (detect → listen → approve → cut; everything stays in sync, Undo restores), music with fades, **ducking from the voice itself** (dips while speaking, rises in pauses; level / dip / release controls) and loop-to-fill, 14 synthesized SFX + your own, video clip sound with trim in/out and loop |
| **Typography studio** | 21 ready styles in 8 groups (Bold, Elegant, Handwritten, Minimal, Neon, Retro, Shorts, Arabic) with animated previews; design editor (layout, palette + custom colours, fonts per role, case, background, glow, entrance / exit, speed); timing on the word, lead-in or **on the music beat**; save your own styles for every project; works next to subtitles |
| **Effects** | Fire, fog, god rays, film burn, glow pulse (GPU shaders), sparks, smoke, confetti, hearts, star burst, lightning (particles) plus the classics; cost labels. **Effects lab**: particle designer with sliders, or a GPU code shader — written by you or by your AI assistant from a description (compile errors shown on your lines), or via a copy-paste prompt for Claude |
| **Guided first video** | Projects → **New video (guided)**: Voice → Captions → Visuals (Auto-edit) → Look (5 templates: Shorts story, Top-10, Documentary, Motivation, Calm explainer) → Export with a readiness summary. Everything stays editable |
| **Simple / Pro** | Simple (default): 5 areas — Media · Voice · Text · Style · AI — with advanced settings folded; Pro: every panel. Switch in the top bar |
| **Version history** | Automatic snapshots while you edit (last 30) — Projects → ⋯ → Version history → Restore |
| **Voice Studio** (beta) | Natural AI voices **on your PC** with voice cloning in 23 languages (English, Arabic…), one-click local install (~5 GB, desktop app); “My voices” library with consent; script → voiceover by paragraph (cached), preview first paragraph; record yourself with a live level meter; enhance presets (Clean, Deep narrator, Warm, Bright, Radio, Phone, Cinematic), −14 LUFS loudness, pace & pitch; Colab as optional turbo |
| **Auto-edit from voiceover** | Editor → **Auto-edit**: splits the narration into scenes (sentences, pauses, target length, optional cuts on the music's beats), writes a visual search per scene (AI assistant or key words), picks your best-matching media (each used once), fills the rest with free public-domain images/video, optionally AI images on Colab, then you review every scene (swap, re-search) and build the timeline with varied motion and transitions — one Undo restores the old edit |
| **Find media by description** | Type “man walking at sunset” in the Media panel: an image-understanding model (CLIP, ~150 MB once, runs on this PC) ranks your images and videos by match |
| **Free media** | No account or key: public-domain / CC0 images, video and sound from **Wikimedia Commons** and **Openverse** (CC BY optional, with automatic credit lines), “From narration here” searches with the words spoken in the current clip, insert / replace / add as music or SFX, plus one-click **Pexels / Pixabay** searches for modern stock |
| **Colour grading** | Colour panel (whole video) + per-clip grade on top: 11 looks with live thumbnails (teal & orange, warm film, golden hour, cool night, moody, vivid, bleach bypass, vintage, matte, noir…), exposure, brightness, contrast, highlights, shadows, temperature, tint, saturation, vibrance, split toning, fade, vignette, and **.cube LUT import** with strength. Copy / paste grades, apply to all clips, save your own looks (available in every project). GPU-rendered, same result in preview and export |
| **Hand-drawn text** | Titles and typography words can be written on: **outline draws itself, then fills** (any font, Arabic too) or **real pen writing** with single-line fonts (script, handwriting, marker, technical) and a glowing nib; writing time adjustable |
| Effects | Grain, VHS, CRT, glitch, light leak, vignette, snow, dust, rain, embers, bokeh, cinematic (stackable) — each on the whole video, a time range or chosen clips, with fades |
| Editor UI | Resizable / collapsible panels and timeline, Settings (performance profile from your hardware, layout reset, version), icon rail + panels, large preview with safe-area guides, direct drag and resize/rotate handles, Properties panel, media bin, resizable virtualized timeline, Shift-click multi-select, undo/redo, toasts, shortcuts (`?`) |
| AI assistant | Auto-edit (motion/transition/SFX per scene), proofread captions, titles/description/hashtags, keyword picking, Flow/image prompt writing |
| Export | Presets (YouTube, Shorts/TikTok/Reels, Instagram, Square, Draft), 1080p/720p/480p, 24–60 fps, explicit bitrates (8/5/2.5 Mbps), MP4 or WebM, audio-only WAV, SRT |
| Google Flow bridge | Scenes from your transcript → prompts (optionally LLM-written) → `flow_prompts.txt` in the extension's format + `scenes.json` → run the extension → drop its `001_v1…` downloads back and they land on their scenes |
| Colab engine | Chatterbox (English / Turbo / Multilingual V3) + voice cloning, faster-whisper, SDXL-Lightning / SDXL-Turbo, Wan 2.1 VACE 1.3B (AI video), Qwen2.5 (script / prompts / chat), Real-ESRGAN image & video |

About Google Flow: AutoStudio does not log into Google, automate Flow's private API, or remove watermarks. Generation happens in your own browser through the extension; the bridge only prepares prompts and maps the downloaded files.

Licence notes for personal use: SDXL-Turbo is non-commercial. SDXL-Lightning, Chatterbox, Whisper, Wan 2.1, Qwen2.5, Depth Anything V2 small, SlimSAM and Real-ESRGAN are permissive.
