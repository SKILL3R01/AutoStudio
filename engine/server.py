"""AutoStudio GPU engine — FastAPI server run from the Colab notebook.

Tools: tts (Chatterbox, via subprocess venv), transcribe (faster-whisper), imagegen (SDXL-Lightning / SDXL-Turbo), videogen (Wan 2.1 VACE 1.3B),
prompts + script (Qwen2.5 Instruct), upscale + video_upscale (Real-ESRGAN via spandrel).
Jobs run one at a time on a single worker thread so models never fight over VRAM.
"""
import gc
import json
import os
import queue
import random
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(os.environ.get("AUTOSTUDIO_HOME", "/content/autostudio"))
JOBS_DIR = ROOT / "jobs"
WEIGHTS = ROOT / "weights"
TTS_PY = os.environ.get("TTS_PYTHON", "/content/tts_env/bin/python")
DRIVE_DIR = Path(os.environ.get("DRIVE_DIR", "/content/drive/MyDrive/AutoStudio"))
USE_DRIVE = DRIVE_DIR.parent.exists()
JOBS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AutoStudio engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

jobs: dict[str, dict] = {}
work: "queue.Queue[str]" = queue.Queue()


class Cancelled(Exception):
    pass


# ───────────────────────────── model residency ─────────────────────────────
class Models:
    """Keeps at most one heavy model family on the GPU at a time."""

    def __init__(self):
        self.name = None
        self.obj = None

    def get(self, name, loader):
        if self.name != name:
            self.free()
            self.obj = loader()
            self.name = name
        return self.obj

    def free(self):
        self.obj = None
        self.name = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


models = Models()


# ───────────────────────────── job helpers ─────────────────────────────
def new_job(tool, params, files):
    jid = uuid.uuid4().hex[:12]
    d = JOBS_DIR / jid
    d.mkdir(parents=True)
    saved = {}
    for key, (name, data) in files.items():
        p = d / f"in_{key}{Path(name).suffix or '.bin'}"
        p.write_bytes(data)
        saved[key] = p
    jobs[jid] = dict(id=jid, tool=tool, status="queued", progress=0.0, logs=[f"Queued {tool}"], files=[], data=None, error=None,
                     params=params, inputs=saved, dir=d, cancel=False, created=time.time())
    work.put(jid)
    return jid


def log(job, msg):
    job["logs"].append(msg)
    job["logs"] = job["logs"][-400:]
    print(f"[{job['id']}] {msg}", flush=True)


def check(job):
    if job["cancel"]:
        raise Cancelled()


def add_file(job, path: Path):
    job["files"].append({"name": path.name, "url": f"/files/{job['id']}/{path.name}"})
    if USE_DRIVE:
        try:
            DRIVE_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy(path, DRIVE_DIR / path.name)
        except Exception as e:  # Drive is best-effort
            log(job, f"(Drive copy failed: {e})")


def worker():
    while True:
        jid = work.get()
        job = jobs.get(jid)
        if not job or job["cancel"]:
            continue
        job["status"] = "running"
        t0 = time.time()
        try:
            TOOLS[job["tool"]](job)
            job["status"] = "done"
            job["progress"] = 1.0
            log(job, f"✓ Finished in {time.time() - t0:.0f}s")
        except Cancelled:
            job["status"] = "error"
            job["error"] = "Cancelled"
            log(job, "Cancelled")
        except Exception as e:
            job["status"] = "error"
            job["error"] = f"{type(e).__name__}: {e}"
            log(job, traceback.format_exc()[-1500:])
            if "out of memory" in str(e).lower():
                models.free()


# ───────────────────────────── TTS (Chatterbox) ─────────────────────────────
def tool_tts(job):
    p = job["params"]
    models.free()  # the TTS subprocess needs the VRAM
    text_file = job["dir"] / "script.txt"
    text_file.write_text(p.get("text", ""), encoding="utf-8")
    out = job["dir"] / f"voiceover_{job['id'][:6]}.wav"
    cmd = [TTS_PY, str(ROOT / "tts_worker.py"), "--text-file", str(text_file), "--out", str(out),
           "--language", p.get("language", "en"), "--model", p.get("model", "auto"),
           "--exaggeration", p.get("exaggeration", "0.5"), "--cfg", p.get("cfg_weight", "0.5"),
           "--temperature", p.get("temperature", "0.8"), "--seed", p.get("seed", "0")]
    if "voice" in job["inputs"]:
        cmd += ["--voice", str(job["inputs"]["voice"])]
    log(job, "Starting Chatterbox subprocess…")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    for line in proc.stdout:
        line = line.rstrip()
        if job["cancel"]:
            proc.kill()
            raise Cancelled()
        if line.startswith("PROGRESS "):
            job["progress"] = float(line.split()[1])
        elif line and not re.match(r"^\s*\d+%\|", line):  # skip tqdm bars
            log(job, line[-300:])
    if proc.wait() != 0 or not out.exists():
        raise RuntimeError("Chatterbox failed — see the log above")
    log(job, "Chatterbox subprocess finished; GPU cache released.")
    add_file(job, out)


# ───────────────────────────── Transcribe (faster-whisper) ─────────────────────────────
def tool_transcribe(job):
    from faster_whisper import WhisperModel

    p = job["params"]
    name = p.get("model", "large-v3")
    model = models.get(f"whisper:{name}", lambda: WhisperModel(name, device="cuda", compute_type="float16"))
    lang = p.get("language", "auto")
    log(job, f"Transcribing with whisper {name}…")
    segments, info = model.transcribe(str(job["inputs"]["file"]), language=None if lang == "auto" else lang,
                                      word_timestamps=True, vad_filter=True, beam_size=5)
    words, segs = [], []
    for s in segments:
        check(job)
        segs.append({"start": s.start, "end": s.end, "text": s.text.strip()})
        for w in s.words or []:
            words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
        job["progress"] = min(0.99, s.end / max(1.0, info.duration))
        log(job, f"[{s.start:7.2f}] {s.text.strip()[:120]}")
    job["data"] = {"words": [w for w in words if w["text"]], "segments": segs, "language": info.language, "duration": info.duration}
    out = job["dir"] / "transcript.json"
    out.write_text(json.dumps(job["data"], ensure_ascii=False))
    add_file(job, out)


# ───────────────────────────── LLM: prompts & scripts (Qwen2.5) ─────────────────────────────
LLM_ID = os.environ.get("LLM_ID", "Qwen/Qwen2.5-3B-Instruct")


def load_llm():
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(LLM_ID)
    model = AutoModelForCausalLM.from_pretrained(LLM_ID, torch_dtype=torch.float16, device_map="cuda")
    return tok, model


def chat(messages, max_new_tokens=200, temperature=0.7):
    tok, model = models.get("llm", load_llm)
    enc = tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to(model.device)
    out = model.generate(**enc, max_new_tokens=max_new_tokens, do_sample=temperature > 0, temperature=max(temperature, 0.01), top_p=0.9,
                         pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()


PROMPT_SYS = ("You turn narration lines from a video into prompts for an image generator. Reply with ONE English prompt, max 45 words, "
              "describing a single concrete visual scene: subject, action, setting, lighting, camera angle. No text, no captions, no quotes, "
              "no names of real people. Keep characters and setting consistent with the story so far.")


def rewrite_prompts(job, items, style, character):
    story = []
    for i, it in enumerate(items):
        check(job)
        ctx = " ".join(story[-3:])
        msg = f"Story so far: {ctx}\nRecurring character: {character or 'none'}\nNarration line: {it['prompt']}\nImage prompt:"
        visual = chat([{"role": "system", "content": PROMPT_SYS}, {"role": "user", "content": msg}], 90, 0.6)
        visual = visual.splitlines()[0].strip().strip('"')
        story.append(it["prompt"])
        it["prompt"] = ", ".join(x for x in [style, character, visual] if x)[:600]
        log(job, f"✎ {it['name']}: {visual[:110]}")
        job["progress"] = 0.25 * (i + 1) / len(items)
    return items


def tool_prompts(job):
    items = json.loads(job["params"]["items"])
    job["data"] = {"items": rewrite_prompts(job, items, job["params"].get("style", ""), job["params"].get("character", ""))}


def tool_chat(job):
    p = job["params"]
    reply = chat(json.loads(p["messages"]), int(p.get("max_tokens", "600")), float(p.get("temperature", "0.6")))
    job["data"] = {"reply": reply}


def tool_script(job):
    p = job["params"]
    minutes = float(p.get("minutes", "2"))
    words = int(minutes * 150)
    sys = ("You are a scriptwriter for faceless YouTube narration videos. Write only the narration — no headings, no scene "
           "directions, no emojis. Short vivid sentences, a strong hook in the first line, a clear story arc and a closing line.")
    msg = f"Topic: {p.get('topic', '')}\nTone: {p.get('tone', 'engaging')}\nLanguage: {p.get('language', 'English')}\nLength: about {words} words."
    log(job, f"Writing a ~{words}-word script with {LLM_ID}…")
    script = chat([{"role": "system", "content": sys}, {"role": "user", "content": msg}], min(4000, int(words * 2.2)), 0.8)
    job["data"] = {"script": script}
    log(job, f"✓ {len(script.split())} words")


# ───────────────────────────── Image generation (SDXL) ─────────────────────────────
SIZES = {
    "lightning": {"16:9": (1344, 768), "9:16": (768, 1344), "1:1": (1024, 1024)},
    "turbo": {"16:9": (1024, 576), "9:16": (576, 1024), "1:1": (768, 768)},
}


def load_sdxl(kind):
    from diffusers import AutoencoderKL, AutoPipelineForText2Image, EulerDiscreteScheduler, StableDiffusionXLPipeline, UNet2DConditionModel

    vae = AutoencoderKL.from_pretrained("madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
    if kind == "turbo":
        pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", vae=vae, torch_dtype=torch.float16, variant="fp16")
    else:
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file

        base = "stabilityai/stable-diffusion-xl-base-1.0"
        unet = UNet2DConditionModel.from_config(base, subfolder="unet").to("cuda", torch.float16)
        unet.load_state_dict(load_file(hf_hub_download("ByteDance/SDXL-Lightning", "sdxl_lightning_4step_unet.safetensors"), device="cuda"))
        pipe = StableDiffusionXLPipeline.from_pretrained(base, unet=unet, vae=vae, torch_dtype=torch.float16, variant="fp16")
        pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
    pipe = pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)
    return pipe


def tool_imagegen(job):
    p = job["params"]
    items = json.loads(p["items"])
    kind = p.get("model", "lightning")
    if p.get("smart_prompts") == "1":
        log(job, "Rewriting narration into visual prompts…")
        items = rewrite_prompts(job, items, p.get("style", ""), p.get("character", ""))
    w, h = SIZES[kind].get(p.get("aspect", "16:9"), SIZES[kind]["16:9"])
    steps = 4 if kind == "lightning" else int(p.get("steps", "4"))
    log(job, f"Loading SDXL-{kind.title()}…")
    pipe = models.get(f"sdxl:{kind}", lambda: load_sdxl(kind))
    seed = int(p.get("seed", "0")) or random.randint(1, 2**31 - 1)
    base = 0.25 if p.get("smart_prompts") == "1" else 0.0
    for i, it in enumerate(items):
        check(job)
        g = torch.Generator("cuda").manual_seed(seed + i)
        img = pipe(prompt=it["prompt"], num_inference_steps=steps, guidance_scale=0.0, width=w, height=h, generator=g).images[0]
        out = job["dir"] / re.sub(r"[^\w.\-]", "_", it["name"])
        img.save(out)
        add_file(job, out)
        job["progress"] = base + (1 - base) * (i + 1) / len(items)
        log(job, f"🖼 {i + 1}/{len(items)} {it['name']}")


# ───────────────────────────── Upscaling (Real-ESRGAN) ─────────────────────────────
def load_esrgan(scale):
    from spandrel import ModelLoader

    path = WEIGHTS / ("RealESRGAN_x2plus.pth" if scale == 2 else "RealESRGAN_x4plus.pth")
    return ModelLoader().load_from_file(str(path)).cuda().eval().half()


@torch.inference_mode()
def upscale_pil(model, img, tile=512, pad=16):
    import numpy as np
    from PIL import Image

    x = torch.from_numpy(np.asarray(img.convert("RGB"))).permute(2, 0, 1).float().div(255).unsqueeze(0).cuda().half()
    _, _, H, W = x.shape
    s = model.scale
    out = torch.zeros((1, 3, H * s, W * s), device="cuda", dtype=torch.half)
    for y in range(0, H, tile):
        for x0 in range(0, W, tile):
            y1, x1 = min(y + tile, H), min(x0 + tile, W)
            py0, px0, py1, px1 = max(0, y - pad), max(0, x0 - pad), min(H, y1 + pad), min(W, x1 + pad)
            r = model(x[:, :, py0:py1, px0:px1])
            out[:, :, y * s:y1 * s, x0 * s:x1 * s] = r[:, :, (y - py0) * s:(y - py0 + y1 - y) * s, (x0 - px0) * s:(x0 - px0 + x1 - x0) * s]
    arr = out.clamp(0, 1).mul(255).round().byte().squeeze(0).permute(1, 2, 0).cpu().numpy()
    return Image.fromarray(arr)


def tool_upscale(job):
    from PIL import Image

    scale = int(job["params"].get("scale", "2"))
    model = models.get(f"esrgan:{scale}", lambda: load_esrgan(scale))
    src = job["inputs"]["file"]
    log(job, f"Upscaling ×{scale}…")
    img = upscale_pil(model, Image.open(src))
    out = job["dir"] / f"{Path(job['params'].get('name', src.stem)).stem}_x{scale}.png"
    img.save(out)
    add_file(job, out)


def tool_video_upscale(job):
    from PIL import Image

    scale = int(job["params"].get("scale", "2"))
    src = job["inputs"]["file"]
    frames = job["dir"] / "frames"
    up = job["dir"] / "up"
    frames.mkdir()
    up.mkdir()
    fps = subprocess.check_output(["ffprobe", "-v", "0", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(src)], text=True).strip()
    log(job, f"Extracting frames ({fps} fps)…")
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), str(frames / "%06d.png")], check=True)
    model = models.get(f"esrgan:{scale}", lambda: load_esrgan(scale))
    files = sorted(frames.glob("*.png"))
    for i, f in enumerate(files):
        check(job)
        upscale_pil(model, Image.open(f)).save(up / f.name)
        job["progress"] = 0.95 * (i + 1) / len(files)
        if i % 10 == 0:
            log(job, f"frame {i + 1}/{len(files)}")
    out = job["dir"] / f"{Path(job['params'].get('name', src.stem)).stem}_x{scale}.mp4"
    log(job, "Encoding…")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", fps, "-i", str(up / "%06d.png"), "-i", str(src), "-map", "0:v", "-map", "1:a?",
                    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out)], check=True)
    shutil.rmtree(frames)
    shutil.rmtree(up)
    add_file(job, out)


# ───────────────────────────── AI video (Wan 2.1 VACE 1.3B) ─────────────────────────────
# Apache-2.0, ~8 GB VRAM. Text → video, or animate a still (the image becomes the first frame). 16 fps, ≤ 5 s.
WAN_ID = "Wan-AI/Wan2.1-VACE-1.3B-diffusers"
WAN_FPS = 16
WAN_SIZES = {"16:9": (832, 480), "9:16": (480, 832), "1:1": (624, 624), "4:5": (544, 672)}
WAN_NEG = ("Bright tones, overexposed, static, blurred details, subtitles, text, watermark, logo, worst quality, low quality, JPEG artifacts, "
           "ugly, deformed, disfigured, extra fingers, poorly drawn hands, poorly drawn faces, still picture, messy background, walking backwards")
WAN_MAX_TOKENS = 226


def wan_dtype():
    # T4 (compute 7.5) has no fast bfloat16 — use float16 there.
    return torch.bfloat16 if torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8 else torch.float16


@torch.inference_mode()
def wan_encode(job, prompts, negative):
    """Run Wan's UMT5-XXL text encoder alone (loaded straight onto the GPU), then free it.

    The encoder is ~11 GB in half precision, so it never shares the GPU with the video model and never sits in
    Colab's 12 GB of RAM. Mirrors diffusers' Wan `_get_t5_prompt_embeds` (226 tokens, zero-padded)."""
    from transformers import AutoTokenizer, UMT5EncoderModel

    if models.name == "wan":
        models.obj.to("cpu")  # park the 1.3B video model in RAM while the encoder uses the GPU
    else:
        models.free()
    dt = wan_dtype()
    log(job, "Loading the text encoder (first run downloads ~11 GB)…")
    tok = AutoTokenizer.from_pretrained(WAN_ID, subfolder="tokenizer")
    te = UMT5EncoderModel.from_pretrained(WAN_ID, subfolder="text_encoder", torch_dtype=dt, device_map="cuda").eval()

    def enc(text):
        t = tok([re.sub(r"\s+", " ", text).strip()], padding="max_length", max_length=WAN_MAX_TOKENS, truncation=True,
                add_special_tokens=True, return_attention_mask=True, return_tensors="pt")
        n = int(t.attention_mask.gt(0).sum())
        h = te(t.input_ids.to("cuda"), t.attention_mask.to("cuda")).last_hidden_state.to(dt)[0, :n]
        return torch.cat([h, h.new_zeros(WAN_MAX_TOKENS - n, h.size(1))]).unsqueeze(0).cpu()

    out = [(enc(p), enc(negative)) for p in prompts]
    del te
    gc.collect()
    torch.cuda.empty_cache()
    return out


def load_wan():
    from diffusers import AutoencoderKLWan, WanVACEPipeline
    from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler

    vae = AutoencoderKLWan.from_pretrained(WAN_ID, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanVACEPipeline.from_pretrained(WAN_ID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=wan_dtype())
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)  # 3.0 for 480p
    pipe.set_progress_bar_config(disable=True)
    try:
        pipe.vae.enable_tiling()
    except Exception:
        pass
    return pipe


def fit_image(img, w, h):
    """Centre-crop to the target aspect, then resize."""
    from PIL import Image

    img = img.convert("RGB")
    sw, sh = img.size
    scale = max(w / sw, h / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


def tool_videogen(job):
    import numpy as np
    from PIL import Image

    p = job["params"]
    w, h = WAN_SIZES.get(p.get("aspect", "16:9"), WAN_SIZES["16:9"])
    seconds = min(5.0, max(1.0, float(p.get("seconds", "3"))))
    frames = int(round(seconds * WAN_FPS / 4)) * 4 + 1  # Wan needs 4k+1 frames
    steps = min(50, max(8, int(p.get("steps", "20"))))
    seed = int(p.get("seed", "0")) or random.randint(1, 2**31 - 1)
    prompt = p.get("prompt", "").strip() or "Cinematic slow camera move, natural motion, high detail"
    first = job["inputs"].get("image")
    log(job, f"{'Animating a still' if first else 'Text to video'} · {w}×{h} · {frames} frames ({frames / WAN_FPS:.1f}s) · {steps} steps")

    [(pe, ne)] = wan_encode(job, [prompt], p.get("negative", "").strip() or WAN_NEG)
    job["progress"] = 0.1
    check(job)
    log(job, "Loading Wan 2.1 VACE 1.3B…")
    pipe = models.get("wan", load_wan)
    pipe.to("cuda")
    dt = wan_dtype()
    kwargs = {}
    if first:
        img = fit_image(Image.open(first), w, h)
        grey = Image.new("RGB", (w, h), (128, 128, 128))
        kwargs["video"] = [img] + [grey] * (frames - 1)
        kwargs["mask"] = [Image.new("L", (w, h), 0)] + [Image.new("L", (w, h), 255)] * (frames - 1)  # black = keep

    def on_step(pipe_, i, _t, kw):
        job["progress"] = 0.1 + 0.8 * (i + 1) / steps
        if (i + 1) % 5 == 0:
            log(job, f"step {i + 1}/{steps}")
        if job["cancel"]:
            pipe_._interrupt = True
        return kw

    t0 = time.time()
    out = pipe(prompt_embeds=pe.to("cuda", dt), negative_prompt_embeds=ne.to("cuda", dt), height=h, width=w, num_frames=frames,
               num_inference_steps=steps, guidance_scale=5.0, generator=torch.Generator("cuda").manual_seed(seed),
               output_type="np", callback_on_step_end=on_step, **kwargs).frames[0]
    check(job)
    log(job, f"Generated in {time.time() - t0:.0f}s — encoding MP4…")
    tmp = job["dir"] / "frames"
    tmp.mkdir(exist_ok=True)
    for i, f in enumerate(out):
        Image.fromarray((np.clip(f, 0, 1) * 255).round().astype("uint8")).save(tmp / f"{i:05d}.png")
    name = re.sub(r"[^\w.\-]", "_", Path(p.get("name", "ai_video")).stem) or "ai_video"
    dest = job["dir"] / f"{name}_ai.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(WAN_FPS), "-i", str(tmp / "%05d.png"), "-c:v", "libx264", "-crf", "17",
                    "-preset", "medium", "-pix_fmt", "yuv420p", str(dest)], check=True)
    shutil.rmtree(tmp)
    job["data"] = {"seed": seed, "fps": WAN_FPS, "frames": frames, "width": w, "height": h}
    add_file(job, dest)


TOOLS = {"tts": tool_tts, "transcribe": tool_transcribe, "imagegen": tool_imagegen, "prompts": tool_prompts, "script": tool_script, "chat": tool_chat,
         "upscale": tool_upscale, "video_upscale": tool_video_upscale, "videogen": tool_videogen}


# ───────────────────────────── HTTP API ─────────────────────────────
@app.get("/health")
def health():
    gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    return {"ok": True, "gpu": gpu, "tools": list(TOOLS), "drive": USE_DRIVE, "queue": work.qsize(), "loaded": models.name}


@app.post("/jobs/{tool}")
async def submit(tool: str, request: Request):
    if tool not in TOOLS:
        raise HTTPException(404, f"Unknown tool {tool}")
    form = await request.form()
    params, files = {}, {}
    for k, v in form.multi_items():
        if hasattr(v, "read"):
            files[k] = (v.filename or k, await v.read())
            params.setdefault("name", v.filename or k)
        else:
            params[k] = v
    return {"id": new_job(tool, params, files)}


@app.get("/jobs/{jid}")
def status(jid: str):
    j = jobs.get(jid)
    if not j:
        raise HTTPException(404, "No such job")
    return {k: j[k] for k in ("id", "status", "progress", "logs", "files", "data", "error")}


@app.post("/jobs/{jid}/cancel")
def cancel(jid: str):
    if jid in jobs:
        jobs[jid]["cancel"] = True
    return {"ok": True}


@app.get("/files/{jid}/{name}")
def file(jid: str, name: str):
    j = jobs.get(jid)
    path = (j["dir"] / name) if j else None
    if not path or not path.exists() or path.parent != j["dir"]:
        raise HTTPException(404)
    return FileResponse(path)


threading.Thread(target=worker, daemon=True).start()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), log_level="warning")
