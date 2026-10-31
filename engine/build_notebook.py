"""Builds AutoStudio_Engine.ipynb from server.py + tts_worker.py. Run: python engine/build_notebook.py"""
import json
from pathlib import Path

HERE = Path(__file__).parent


def code(src):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": src.strip("\n").splitlines(True)}


def md(src):
    return {"cell_type": "markdown", "metadata": {}, "source": src.strip("\n").splitlines(True)}


INTRO = """
# AutoStudio — Colab GPU engine

Free AI backend for the AutoStudio editor: **Chatterbox** voiceover + voice cloning, **faster-whisper** word-level captions,
**SDXL-Lightning / SDXL-Turbo** image generation, **Qwen2.5** script & prompt writing, and **Real-ESRGAN** image/video upscaling.

1. **Runtime → Change runtime type → T4 GPU**
2. **Runtime → Run all** (first run installs everything, ~5 min)
3. Copy the `https://….trycloudflare.com` URL printed in step 4 and paste it into AutoStudio → **Connect engine**.

The URL changes every session. Models download on first use and are cached for the session.
"""

SETTINGS = """
#@title 1 · Settings & GPU check
USE_DRIVE = True  #@param {type:"boolean"}
PRELOAD_MODELS = False  #@param {type:"boolean"}
import os, subprocess
gpu = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
print("GPU:", gpu or "⚠️ none — Runtime → Change runtime type → T4 GPU")
if USE_DRIVE:
    from google.colab import drive
    drive.mount("/content/drive")
os.makedirs("/content/autostudio/weights", exist_ok=True)
"""

INSTALL = """
#@title 2 · Install (first run ≈ 5 min)
!pip -q install fastapi "uvicorn[standard]" python-multipart faster-whisper spandrel diffusers accelerate huggingface_hub safetensors
!which uv >/dev/null || pip -q install uv
# Chatterbox pins its own torch/transformers, so it lives in an isolated Python 3.11 venv.
![ -x /content/tts_env/bin/python ] || uv venv -q /content/tts_env --python 3.11
!uv pip install -q --python /content/tts_env/bin/python chatterbox-tts==0.1.7
!wget -q -nc -O /content/autostudio/weights/RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
!wget -q -nc -O /content/autostudio/weights/RealESRGAN_x2plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth
![ -x /content/cloudflared ] || (wget -q -O /content/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /content/cloudflared)
print("✅ Installed")
"""

PRELOAD = """
#@title 3 · (optional) Pre-download models so the first job starts faster
if PRELOAD_MODELS:
    from huggingface_hub import snapshot_download
    for repo in ["Systran/faster-whisper-large-v3", "stabilityai/stable-diffusion-xl-base-1.0", "ByteDance/SDXL-Lightning",
                 "madebyollin/sdxl-vae-fp16-fix", "Qwen/Qwen2.5-3B-Instruct"]:
        print("↓", repo)
        snapshot_download(repo, allow_patterns=["*.json", "*.txt", "*.model", "*fp16*.safetensors", "*4step_unet.safetensors", "*.bin", "model*.safetensors", "*.py"])
    !/content/tts_env/bin/python -c "from chatterbox.tts import ChatterboxTTS; ChatterboxTTS.from_pretrained(device='cpu')"
else:
    print("Skipped (models download on first use).")
"""

START = """
#@title 4 · Start the engine & public URL
import os, re, subprocess, threading, time, glob, requests
subprocess.run('pkill -f "autostudio/server.py"; pkill -f cloudflared', shell=True)
libs = [p for pat in ("/usr/local/lib/python3*/dist-packages/nvidia/cudnn/lib", "/usr/local/lib/python3*/dist-packages/nvidia/cublas/lib") for p in glob.glob(pat)]
env = dict(os.environ, AUTOSTUDIO_HOME="/content/autostudio", PYTHONUNBUFFERED="1",
           LD_LIBRARY_PATH=":".join(libs + [os.environ.get("LD_LIBRARY_PATH", "")]))
LOG = "/content/autostudio/server.log"
server = subprocess.Popen(["python", "/content/autostudio/server.py"], stdout=open(LOG, "w"), stderr=subprocess.STDOUT, env=env)
for _ in range(90):
    try:
        if requests.get("http://127.0.0.1:8000/health", timeout=2).ok: break
    except Exception:
        time.sleep(1)
else:
    print(open(LOG).read()); raise SystemExit("Server failed to start")
tunnel = subprocess.Popen(["/content/cloudflared", "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8000"],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
PUBLIC_URL = None
for line in tunnel.stdout:
    m = re.search(r"https://[a-z0-9-]+\\.trycloudflare\\.com", line)
    if m:
        PUBLIC_URL = m.group(0); break
threading.Thread(target=lambda: [None for _ in tunnel.stdout], daemon=True).start()  # keep draining the pipe
time.sleep(4)
print("=" * 64)
print("✅ AUTOSTUDIO ENGINE READY")
print("🔗 ENGINE URL:", PUBLIC_URL)
print("   Paste it into AutoStudio → Connect engine")
print("=" * 64)
"""

KEEP = """
#@title 5 · Keep alive & live engine log (leave this running)
import time
pos = 0
try:
    while True:
        with open(LOG) as f:
            f.seek(pos); new = f.read(); pos = f.tell()
        if new: print(new, end="")
        if server.poll() is not None:
            print("⚠️ Engine stopped — re-run step 4"); break
        time.sleep(3)
except KeyboardInterrupt:
    print("Stopped watching (engine keeps running).")
"""


def main():
    server = (HERE / "server.py").read_text(encoding="utf-8")
    worker = (HERE / "tts_worker.py").read_text(encoding="utf-8")
    cells = [md(INTRO), code(SETTINGS), code(INSTALL),
             code("%%writefile /content/autostudio/server.py\n" + server),
             code("%%writefile /content/autostudio/tts_worker.py\n" + worker),
             code(PRELOAD), code(START), code(KEEP)]
    nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                                       "kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}},
          "nbformat": 4, "nbformat_minor": 0}
    out = HERE / "AutoStudio_Engine.ipynb"
    out.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main()
