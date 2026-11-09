"""Chatterbox TTS worker. Runs inside its own venv (chatterbox pins torch/transformers versions).
- CLI mode: launched per job by server.py (Colab) so the GPU is fully released when it exits.
- `--serve`: persistent mode used by the desktop app's local voice engine (model stays loaded)."""
import argparse
import os
import re
import sys

import torch
import torchaudio as ta


def log(msg):
    print(msg, flush=True)


def chunk_text(text, max_chars):
    """Split on sentence boundaries, packing sentences into chunks of at most max_chars."""
    text = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?…。！？؟])\s+", text)
    chunks, cur = [], ""
    for s in sentences:
        while len(s) > max_chars:  # very long sentence: split on commas / spaces
            cut = max(s.rfind(",", 0, max_chars), s.rfind("،", 0, max_chars), s.rfind(" ", 0, max_chars))
            cut = cut + 1 if cut > max_chars // 3 else max_chars
            chunks.append(s[:cut].strip())
            s = s[cut:].strip()
        if len(cur) + len(s) + 1 > max_chars and cur:
            chunks.append(cur.strip())
            cur = ""
        cur += " " + s
    if cur.strip():
        chunks.append(cur.strip())
    return [c for c in chunks if c]


_models = {}


def get_model(kind, device):
    """Load (once per process) the Chatterbox variant and return (model, generate(text, voice, lang, ex, cfg, temp))."""
    if kind in _models:
        return _models[kind]
    log(f"Loading Chatterbox ({kind}) on {device}…")
    if kind == "multilingual" and os.environ.get("AUTOSTUDIO_ZH") != "1" and "spacy_pkuseg" not in sys.modules:
        # The Chinese word segmenter downloads its model from GitHub with a 5 s timeout, which fails on slow or
        # filtered networks. Chatterbox skips it when the import fails, so block it unless Chinese is needed.
        sys.modules["spacy_pkuseg"] = None
    if kind == "multilingual":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        try:
            model = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model="v3")
        except TypeError:
            model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        gen = lambda t, v, lang, ex, cfg, temp: model.generate(t, language_id=lang, audio_prompt_path=v, exaggeration=ex, cfg_weight=cfg, temperature=temp)
    elif kind == "turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        model = ChatterboxTurboTTS.from_pretrained(device=device)
        gen = lambda t, v, lang, ex, cfg, temp: model.generate(t, audio_prompt_path=v)
    else:
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=device)
        gen = lambda t, v, lang, ex, cfg, temp: model.generate(t, audio_prompt_path=v, exaggeration=ex, cfg_weight=cfg, temperature=temp)
    _models.clear()  # one model in memory at a time
    _models[kind] = (model, gen)
    return _models[kind]


def resolve_kind(kind, language, voice):
    if kind == "auto":
        kind = "english" if language == "en" else "multilingual"
    if kind == "turbo" and not voice:
        log("Turbo needs a reference voice — falling back to the standard English model.")
        kind = "english"
    return kind


def synth(text, out, voice, language, kind, exaggeration, cfg, temperature, seed, max_chars, pause_s, on_progress):
    if seed:
        torch.manual_seed(seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, gen = get_model(resolve_kind(kind, language, voice), device)
    chunks = chunk_text(text, max_chars)
    log(f"{len(chunks)} chunks · {len(text)} chars")
    pause = torch.zeros(1, int(model.sr * pause_s))
    parts = []
    for i, c in enumerate(chunks):
        wav = gen(c, voice, language, exaggeration, cfg, temperature).detach().cpu()
        if wav.dim() == 1:
            wav = wav.unsqueeze(0)
        parts += [wav, pause]
        on_progress((i + 1) / len(chunks), i + 1, len(chunks))
    audio = torch.cat(parts[:-1], dim=1) if parts else torch.zeros(1, model.sr)
    ta.save(out, audio, model.sr)
    return audio.shape[1] / model.sr


_vc = None


def convert_voice(audio, voice, out):
    """Re-voice: same words and timing as `audio`, in the voice of the `voice` sample (Chatterbox VC)."""
    global _vc
    import torchaudio as ta
    from chatterbox.vc import ChatterboxVC
    if _vc is None:
        _vc = ChatterboxVC.from_pretrained("cuda" if torch.cuda.is_available() else "cpu")
    wav = _vc.generate(audio=audio, target_voice_path=voice)
    ta.save(out, wav, _vc.sr)
    return wav.shape[-1] / _vc.sr


_sep = None


def separate(audio, vocals_out, background_out, on_progress, segment=20.0):
    """Split a recording into voice and background (music, ambience) with Demucs htdemucs, segment by segment."""
    global _sep
    import torchaudio as ta
    from demucs.apply import apply_model
    from demucs.pretrained import get_model
    if _sep is None:
        _sep = get_model("htdemucs")
        _sep.eval()
    m = _sep
    wav, sr = ta.load(audio)
    if sr != m.samplerate:
        wav = ta.functional.resample(wav, sr, m.samplerate)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    wav = wav[:2]
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    x = (wav - mean) / std
    n = x.shape[1]
    seg = int(segment * m.samplerate)
    vi = m.sources.index("vocals")
    voc, bg = torch.zeros_like(x), torch.zeros_like(x)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    with torch.no_grad():
        for i in range(0, n, seg):
            part = x[:, i:i + seg]
            src = apply_model(m, part[None], device=dev, split=True, overlap=0.25, progress=False)[0]
            voc[:, i:i + seg] = src[vi]
            bg[:, i:i + seg] = src.sum(0) - src[vi]
            on_progress(min(1.0, (i + seg) / n))
    ta.save(vocals_out, voc * std + mean, m.samplerate)
    ta.save(background_out, bg * std + mean, m.samplerate)


def serve():
    """Persistent mode for the desktop app: one JSON job per stdin line, JSON events on stdout; the model stays loaded."""
    import json

    def emit(**kw):
        print(json.dumps(kw, ensure_ascii=False), flush=True)

    emit(ready=True, device="cuda" if torch.cuda.is_available() else "cpu", torch=torch.__version__)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        jid = job.get("id", "")
        try:
            if job.get("type") == "vc":
                dur = convert_voice(job["audio"], job["voice"], job["out"])
                emit(id=jid, done=True, duration=round(dur, 3))
                continue
            if job.get("type") == "separate":
                separate(job["audio"], job["vocals"], job["background"], lambda f: emit(id=jid, progress=round(f, 4), chunk=0, chunks=0))
                emit(id=jid, done=True, duration=0)
                continue
            if job.get("warmup"):
                get_model(resolve_kind(job.get("model", "multilingual"), job.get("language", "en"), None), "cuda" if torch.cuda.is_available() else "cpu")
                emit(id=jid, done=True, duration=0)
                continue
            dur = synth(job["text"], job["out"], job.get("voice") or None, job.get("language", "en"), job.get("model", "multilingual"),
                        float(job.get("exaggeration", 0.5)), float(job.get("cfg", 0.5)), float(job.get("temperature", 0.8)),
                        int(job.get("seed", 0)), int(job.get("max_chars", 280)), float(job.get("pause", 0.18)),
                        lambda f, i, n: emit(id=jid, progress=round(f, 4), chunk=i, chunks=n))
            emit(id=jid, done=True, duration=round(dur, 3))
        except Exception as e:  # report and keep serving
            emit(id=jid, error=f"{type(e).__name__}: {e}")


def main():
    if "--serve" in sys.argv:
        return serve()
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default="")
    ap.add_argument("--language", default="en")
    ap.add_argument("--model", default="auto")
    ap.add_argument("--exaggeration", type=float, default=0.5)
    ap.add_argument("--cfg", type=float, default=0.5)
    ap.add_argument("--temperature", type=float, default=0.8)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--max-chars", type=int, default=280)
    ap.add_argument("--pause", type=float, default=0.18)
    a = ap.parse_args()
    text = open(a.text_file, encoding="utf-8").read()

    def progress(f, i, n):
        log(f"PROGRESS {f:.4f}")
        log(f"✅ Chunk {i}/{n} done.")

    dur = synth(text, a.out, a.voice or None, a.language, a.model, a.exaggeration, a.cfg, a.temperature, a.seed, a.max_chars, a.pause, progress)
    log(f"Saved {a.out} ({dur:.1f}s)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # surface the error to the job log
        log(f"ERROR {type(e).__name__}: {e}")
        sys.exit(1)
