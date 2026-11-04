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
**SDXL-Lightning / SDXL-Turbo** image generation, **Wan 2.1 VACE 1.3B** AI video (text → video, or animate a still; the first video job
downloads ~18 GB and takes several minutes per 3-second clip on a free T4), **Qwen2.5** script & prompt writing, and **Real-ESRGAN** image/video upscaling.

1. **Runtime → Change runtime type → T4 GPU**
2. **Runtime → Run all** (first run installs everything, ~5 min)
3. When step 4 finishes, click **Open desktop app & connect** (or **Connect browser version**). You can also copy the `https://….trycloudflare.com` URL into AutoStudio → **Connect engine**.

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
!pip -q install fastapi "uvicorn[standard]" python-multipart faster-whisper spandrel diffusers accelerate huggingface_hub safetensors ftfy
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
PUBLIC_URL, registered = None, False
for line in tunnel.stdout:
    m = re.search(r"https://[a-z0-9-]+\\.trycloudflare\\.com", line)
    if m and not PUBLIC_URL:
        PUBLIC_URL = m.group(0)
    if "Registered tunnel connection" in line:
        registered = True
    if PUBLIC_URL and registered:
        break
threading.Thread(target=lambda: [None for _ in tunnel.stdout], daemon=True).start()  # keep draining the pipe
# A brand-new trycloudflare address needs a few seconds before it resolves; asking too early can make
# computers cache "not found" for minutes. Only announce the URL once it answers from the internet.
reachable = False
for _ in range(30):
    time.sleep(2)
    try:
        reachable = requests.get(PUBLIC_URL + "/health", timeout=5).ok
    except Exception:
        reachable = False
    if reachable:
        break
diag = requests.get("http://127.0.0.1:8000/diagnostics", timeout=240).json()
print("=" * 64)
print("✅ AUTOSTUDIO ENGINE READY" if reachable else "⚠️ ENGINE RUNNING, but the public URL is not answering yet — wait 30 s, then connect")
print("🔗 ENGINE URL:", PUBLIC_URL)
print("-" * 64)
for c in diag["checks"]:
    print(("✅" if c["ok"] else "❌"), c["name"], "—", c["detail"])
if not all(c["ok"] for c in diag["checks"]):
    print("❌ = that tool will fail. Re-run step 2 (Install) and send its output if it stays red.")
print("   Click a Connect button below, or paste the URL into AutoStudio → Connect engine")
print("=" * 64)
from urllib.parse import quote
from IPython.display import HTML, display
_q = quote(PUBLIC_URL or "", safe="")
display(HTML(f'''
<div style="font-family:system-ui;padding:14px;border-radius:12px;background:#14161c;color:#eee;max-width:680px">
  <b style="font-size:16px">Connect AutoStudio to this engine</b>
  <div style="margin:10px 0;display:flex;gap:10px;flex-wrap:wrap">
    <a href="autostudio://engine?url={_q}" style="background:#8b6cff;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Open desktop app &amp; connect</a>
    <a href="http://localhost:5173/#engine={_q}" target="_blank" style="background:#2a2f3a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Connect browser version</a>
    <button onclick="navigator.clipboard.writeText('{PUBLIC_URL}');this.innerText='Copied ✓'" style="background:#2a2f3a;color:#fff;padding:10px 16px;border-radius:8px;border:0;font-weight:700;cursor:pointer">Copy URL</button>
  </div>
  <code style="color:#b39dff">{PUBLIC_URL}</code>
  <div style="color:#999;font-size:12px;margin-top:8px">Keep this tab open — the engine stops when the Colab session ends. A new run gives a new URL.</div>
</div>'''))
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
    return out


PUBLIC_REPO = "https://github.com/SKILL3R01/autostudio-engine.git"
PUBLIC_README = """# AutoStudio engine (Google Colab)

Free GPU backend for the AutoStudio video editor: voiceover + voice cloning (Chatterbox), word-level captions
(faster-whisper), image generation (SDXL), AI video (Wan 2.1 VACE 1.3B), LLM (Qwen2.5) and upscaling (Real-ESRGAN).

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/SKILL3R01/autostudio-engine/blob/main/AutoStudio_Engine.ipynb)

1. Open the notebook in Colab (badge above), then **Runtime → Change runtime type → T4 GPU**.
2. **Runtime → Run all**.
3. When it finishes, click **Open desktop app & connect** (or copy the URL into AutoStudio → Connect engine).
"""


def publish(nb: Path):
    """Push the generated notebook to the public repo that Colab opens (only the notebook is public)."""
    import shutil
    import subprocess

    dest = HERE / ".publish"
    if (dest / ".git").exists():
        subprocess.run(["git", "-C", str(dest), "pull", "-q"], check=False)
    else:
        subprocess.run(["git", "clone", "-q", PUBLIC_REPO, str(dest)], check=True)
    shutil.copy(nb, dest / nb.name)
    (dest / "README.md").write_text(PUBLIC_README, encoding="utf-8")
    subprocess.run(["git", "-C", str(dest), "add", "-A"], check=True)
    if subprocess.run(["git", "-C", str(dest), "diff", "--cached", "--quiet"]).returncode == 0:
        return print("public notebook already up to date")
    ident = ["-c", "user.name=Maher Ayadi", "-c", "user.email=SKILL3R01@users.noreply.github.com"]
    subprocess.run(["git", "-C", str(dest), *ident, "commit", "-q", "-m", "Update AutoStudio engine notebook"], check=True)
    subprocess.run(["git", "-C", str(dest), "push", "-q", "-u", "origin", "HEAD:main"], check=True)
    print("published to", PUBLIC_REPO)


if __name__ == "__main__":
    import sys

    path = main()
    if "--publish" in sys.argv:
        publish(path)
