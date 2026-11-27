"""Build the recorded sound pack used by "Sounds from the script" (web/src/audio/pack/).

Every sound is a real recording released under CC0 (public domain): BigSoundBank (Joseph SARDIN, CC0, not in
Content ID) and Freesound (only sounds whose page shows the CC0 licence). The licence is checked on the source page
before download. Each file is trimmed (leading silence), cut to a useful length with a fade, loudness-normalised and
saved as MP3. Writes pack.json (credits + rules) and CREDITS.md. Needs ffmpeg on PATH.

    python scripts/build-sfx-pack.py            # build / refresh everything
    python scripts/build-sfx-pack.py --sheet    # also render spectrograms to .shots/sfx-pack/ for review
"""
import html, json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'audio', 'pack')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', 'Accept': 'text/html'}

# (rule, id, source, search query or freesound user, seconds to keep, mono, LUFS)
PACK = [
    ('typing', '0229', 'bsb', 'computer keyboard', 3.5, True, -20),
    ('typing', '1733', 'bsb', 'computer keyboard', 3.5, True, -20),
    ('steps', '0165', 'bsb', 'footsteps', 4, True, -20),
    ('steps', '1515', 'bsb', 'footsteps', 4, True, -20),
    ('run', '0514', 'bsb', 'footsteps', 3.5, True, -20),
    ('breath', '2195', 'bsb', 'breathing', 4.5, True, -22),
    ('pant', '1103', 'bsb', 'breathing', 4, True, -21),
    ('sigh', '1405', 'bsb', 'breathing', 3, True, -21),
    ('sigh', '1404', 'bsb', 'breathing', 3, True, -21),
    ('scream', '222585', 'fs', 'queen_westeros', 3, True, -18),
    ('scream', '220818', 'fs', 'EricSueiro', 2, True, -18),
    ('knock', '0015', 'bsb', 'knock door', 2.5, True, -19),
    ('knock', '0320', 'bsb', 'knock door', 2.5, True, -19),
    ('door', '0223', 'bsb', 'door slam', 2.5, True, -19),
    ('door', '1704', 'bsb', 'door close', 3, True, -19),
    ('heartbeat', '0218', 'bsb', 'heartbeat', 4.5, True, -19),
    ('heartbeat', '1930', 'bsb', 'heartbeat', 4.5, True, -19),
    ('thunder', '3113', 'bsb', 'thunder', 6, False, -18),
    ('thunder', '3114', 'bsb', 'thunder', 6, False, -18),
    ('rain', '1289', 'bsb', 'rain', 6, False, -22),
    ('rain', '2679', 'bsb', 'rain', 6, False, -22),
    ('wind', '0154', 'bsb', 'wind', 6, False, -22),
    ('wind', '0146', 'bsb', 'wind', 6, False, -22),
    ('message', '1111', 'bsb', 'notification', 2, True, -20),
    ('buzz', '0023', 'bsb', 'phone vibrate', 3, True, -20),
    ('laugh', '670839', 'fs', 'quavosh', 2.5, True, -19),
    ('laugh', '401214', 'fs', 'stuxer', 4, True, -19),
    ('crowd', '2363', 'bsb', 'applause', 5, False, -19),
    ('crowd', '0019', 'bsb', 'applause', 5, False, -19),
    ('punch', '2460', 'bsb', 'punch', 1.2, True, -17),
    ('punch', '2461', 'bsb', 'punch', 1.2, True, -17),
    ('glass', '1121', 'bsb', 'crash', 2.5, True, -18),
    ('camera', '0307', 'bsb', 'camera', 1.2, True, -19),
    ('camera', '2394', 'bsb', 'camera', 1.2, True, -19),
    ('pen', '3235', 'bsb', 'pencil', 3, True, -22),
    ('pen', '0221', 'bsb', 'pencil', 3, True, -22),
    ('page', '0164', 'bsb', 'page', 1.5, True, -20),
    ('page', '2212', 'bsb', 'page', 1.8, True, -20),
]


def get(url, binary=False):
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    return data if binary else data.decode('utf-8', 'ignore')


def bsb(sid, query):
    """Title, page and mp3 of a BigSoundBank sound; its page must say Free and royalty-free (CC0)."""
    s = get('https://bigsoundbank.com/search?q=' + urllib.parse.quote(query))
    m = re.search(r"<a href='/([^']+-s%s\.html)'>(.*?)</a>" % sid, s, re.S)
    if not m:
        raise SystemExit(f'BigSoundBank {sid} not found for "{query}"')
    page = 'https://bigsoundbank.com/' + m.group(1)
    title = re.sub(r'<[^>]+>|&nbsp;', ' ', m.group(2)).replace('#', ' #').split()
    p = get(page)
    if not re.search(r'royalty[- ]free|CC0', p, re.I):
        raise SystemExit(f'{page}: no CC0 / royalty-free mention, not used')
    return ' '.join(title), page, f'https://bigsoundbank.com/UPLOAD/mp3/{sid}.mp3', 'Joseph SARDIN (BigSoundBank)'


def fs(sid, user):
    page = f'https://freesound.org/people/{user}/sounds/{sid}/'
    p = get(page)
    if 'creativecommons.org/publicdomain/zero/1.0' not in p:
        raise SystemExit(f'{page}: not CC0, not used')
    m = re.search(r'<title>(.*?)</title>', p, re.S)
    title = html.unescape(m.group(1)).strip() if m else sid
    title = re.sub(r'^Freesound - |"| by \S+$|\.(wav|mp3|ogg|flac|aiff?)', '', title, flags=re.I).strip()
    mp3 = re.search(r'https://cdn\.freesound\.org/previews/[^"\']+?-hq\.mp3', p).group(0)
    return title, page, mp3, f'{user} (Freesound)'


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    entries, n = [], {}
    for rule, sid, src, q, secs, mono, lufs in PACK:
        title, page, mp3, author = bsb(sid, q) if src == 'bsb' else fs(sid, q)
        n[rule] = n.get(rule, 0) + 1
        name = f'{rule}_{n[rule]}.mp3'
        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, 'raw.mp3')
            open(raw, 'wb').write(get(mp3, True))
            fade = min(0.4, secs / 5)
            af = (f'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,atrim=0:{secs},'
                  f'afade=t=in:d=0.005,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
                  f'afade=t=out:st={max(0, secs - fade)}:d={fade},loudnorm=I={lufs}:TP=-2:LRA=11,aresample=44100')
            ffmpeg('-i', raw, '-af', af, '-ac', '1' if mono else '2', '-c:a', 'libmp3lame', '-b:a', '96k' if mono else '128k', os.path.join(OUT, name))
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', os.path.join(OUT, name)], capture_output=True, text=True).stdout)
        entries.append({'id': name[:-4], 'rule': rule, 'file': name, 'title': title, 'author': author, 'source': page, 'licence': 'CC0 1.0', 'duration': round(dur, 2)})
        print(f'{name:16} {dur:5.2f}s  {title}  <- {page}')
    json.dump(entries, open(os.path.join(OUT, 'pack.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8') as f:
        f.write('# Recorded sound effects\n\nAll sounds are released under CC0 1.0 (public domain). Thank you to the recordists.\n\n')
        for e in entries:
            f.write(f"- `{e['file']}`: {e['title']}, by {e['author']}: {e['source']}\n")
    if '--sheet' in sys.argv:
        sheet = os.path.join(os.path.dirname(ROOT), '.shots', 'sfx-pack')
        os.makedirs(sheet, exist_ok=True)
        from PIL import Image, ImageDraw
        tiles = []
        for e in entries:
            png = os.path.join(sheet, e['id'] + '.png')
            ffmpeg('-i', os.path.join(OUT, e['file']), '-lavfi', 'showspectrumpic=s=480x120:legend=0:scale=log', png)
            im = Image.open(png).convert('RGB')
            ImageDraw.Draw(im).text((6, 4), f"{e['id']}  {e['title'][:46]}  {e['duration']}s", fill=(255, 255, 0))
            tiles.append(im)
        w, h = tiles[0].size
        cols = 3
        out = Image.new('RGB', (w * cols, h * -(-len(tiles) // cols)))
        for i, im in enumerate(tiles):
            out.paste(im.resize((w, h)), ((i % cols) * w, (i // cols) * h))
        out.save(os.path.join(sheet, 'sheet.png'))


if __name__ == '__main__':
    main()
