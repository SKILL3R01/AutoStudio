"""Chatterbox TTS worker. Runs inside its own venv (chatterbox pins torch/transformers versions),
launched as a subprocess by server.py so the GPU is fully released when it exits."""
import argparse
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


def main():
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

    if a.seed:
        torch.manual_seed(a.seed)
    text = open(a.text_file, encoding="utf-8").read()
    voice = a.voice or None
    device = "cuda" if torch.cuda.is_available() else "cpu"

    kind = a.model
    if kind == "auto":
        kind = "english" if a.language == "en" else "multilingual"
    if kind == "turbo" and not voice:
        log("Turbo needs a reference voice — falling back to the standard English model.")
        kind = "english"

    log(f"Loading Chatterbox ({kind}) on {device}…")
    if kind == "multilingual":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        try:
            model = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model="v3")
        except TypeError:
            model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        gen = lambda t: model.generate(t, language_id=a.language, audio_prompt_path=voice, exaggeration=a.exaggeration, cfg_weight=a.cfg, temperature=a.temperature)
    elif kind == "turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        model = ChatterboxTurboTTS.from_pretrained(device=device)
        gen = lambda t: model.generate(t, audio_prompt_path=voice)
    else:
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=device)
        gen = lambda t: model.generate(t, audio_prompt_path=voice, exaggeration=a.exaggeration, cfg_weight=a.cfg, temperature=a.temperature)

    chunks = chunk_text(text, a.max_chars)
    log(f"{len(chunks)} chunks · {len(text)} chars")
    pause = torch.zeros(1, int(model.sr * a.pause))
    parts = []
    for i, c in enumerate(chunks):
        wav = gen(c).detach().cpu()
        if wav.dim() == 1:
            wav = wav.unsqueeze(0)
        parts += [wav, pause]
        log(f"PROGRESS {(i + 1) / len(chunks):.4f}")
        log(f"✅ Chunk {i + 1}/{len(chunks)} done.")
    audio = torch.cat(parts[:-1], dim=1) if parts else torch.zeros(1, model.sr)
    ta.save(a.out, audio, model.sr)
    log(f"Saved {a.out} ({audio.shape[1] / model.sr:.1f}s)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # surface the error to the job log
        log(f"ERROR {type(e).__name__}: {e}")
        sys.exit(1)
