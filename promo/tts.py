"""التعليق الصوتي للفيديو التعريفي عبر Gemini TTS (يعمل في GitHub Actions بالسر GEMINI_API_KEY).

  python3 promo/tts.py samples OUT_DIR            ← نفس الفقرة بعدة أصوات للاختيار + نسخ نصية للتحقق
  python3 promo/tts.py full OUT_DIR VOICE [MODEL]  ← ملف لكل مشهد من promo/script.json + durations.json

المفتاح لا يُطبع ولا يُحفظ. كل ملف يُتحقق منه بإعادة تفريغه نصياً (transcripts.json) لكشف قراءة التعليمات بصوت عالٍ.
"""
import base64, json, os, re, sys, time, urllib.request, urllib.error, wave

KEY = os.environ.get('GEMINI_API_KEY', '').strip()
BASE = 'https://generativelanguage.googleapis.com/v1beta'
HERE = os.path.dirname(os.path.abspath(__file__))

STYLE = (
    "You are a professional voice-over artist recording a premium product film. Read the Arabic narration below aloud "
    "as a warm, confident, calm Iraqi man in his thirties, with a refined documentary tone — natural and human, never "
    "robotic, never a loud advert voice. Use clear, correct Modern Standard Arabic with natural pauses at commas and "
    "ellipses (…), subtle emphasis on key words, and a steady, unhurried pace. Read ONLY the narration text, nothing else.\n\n"
    "Narration:\n"
)
STYLE_MULTI = (
    "After each paragraph below, stay completely silent for two full seconds before starting the next one. "
    "Do not read the paragraph separators.\n\n"
)
SAMPLE_VOICES = [v for v in os.environ.get('SAMPLE_VOICES', 'Charon,Orus,Algieba,Gacrux').split(',') if v]
# الحصة المجانية صغيرة (≈١٠ طلبات يومياً): نولّد المشاهد في دفعات قليلة ثم نقسّمها عند فترات الصمت
CHUNKS = int(os.environ.get('TTS_CHUNKS', '4'))


def call(path, body=None, tries=6):
    url = f'{BASE}/{path}'
    for i in range(tries):
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:400]
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                wait = 20 * (i + 1)
                print(f'  {e.code} — retry in {wait}s: {msg[:160]}', flush=True)
                time.sleep(wait)
                continue
            raise SystemExit(f'HTTP {e.code} on {path}: {msg}')
    raise SystemExit('gave up')


def models():
    out, token = [], ''
    while True:
        r = call('models?pageSize=200' + (f'&pageToken={token}' if token else ''))
        out += r.get('models', [])
        token = r.get('nextPageToken')
        if not token:
            return out


def pick_tts(ms, want=None):
    names = [m['name'].split('/', 1)[1] for m in ms]
    if want:
        if want not in names:
            raise SystemExit(f'model {want} not available. TTS models: {[n for n in names if "tts" in n]}')
        return want
    tts = [n for n in names if 'tts' in n]
    if not tts:
        raise SystemExit('no TTS model available for this key')

    def score(n):
        v = re.findall(r'(\d+(?:\.\d+)?)', n)
        ver = float(v[0]) if v else 0
        return (ver, 'pro' in n, 'preview' not in n, n)
    return sorted(tts, key=score)[-1]


def pick_text_model(ms):
    names = [m['name'].split('/', 1)[1] for m in ms if 'generateContent' in m.get('supportedGenerationMethods', [])]
    cands = [n for n in names if 'flash' in n and 'tts' not in n and 'image' not in n and 'live' not in n and 'lite' not in n]
    cands.sort(key=lambda n: (float((re.findall(r'(\d+(?:\.\d+)?)', n) or ['0'])[0]), 'preview' not in n))
    return cands[-1] if cands else None


def synth(model, voice, text):
    body = {
        'contents': [{'parts': [{'text': STYLE + text}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}},
        },
    }
    r = call(f'models/{model}:generateContent', body)
    part = r['candidates'][0]['content']['parts'][0]['inlineData']
    rate = int(re.search(r'rate=(\d+)', part.get('mimeType', '')).group(1)) if 'rate=' in part.get('mimeType', '') else 24000
    return base64.b64decode(part['data']), rate


def save_wav(path, pcm, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return len(pcm) / 2 / rate


def transcribe(model, path):
    if not model:
        return None
    data = base64.b64encode(open(path, 'rb').read()).decode()
    body = {'contents': [{'parts': [
        {'text': 'Transcribe this Arabic audio exactly, word for word, in Arabic script. Output only the transcript.'},
        {'inlineData': {'mimeType': 'audio/wav', 'data': data}}]}]}
    try:
        r = call(f'models/{model}:generateContent', body, tries=3)
        return r['candidates'][0]['content']['parts'][0].get('text', '').strip()
    except SystemExit as e:
        return f'(transcription failed: {e})'


def main():
    if not KEY:
        raise SystemExit('GEMINI_API_KEY is not set')
    mode, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    ms = models()
    tts_names = [m['name'].split('/', 1)[1] for m in ms if 'tts' in m['name']]
    json.dump({'tts_models': tts_names, 'all': [m['name'] for m in ms]}, open(f'{out}/models.json', 'w'), indent=1)
    script = json.load(open(os.path.join(HERE, 'script.json')))
    scenes = script['scenes']
    text_model = pick_text_model(ms)

    if mode == 'samples':
        model = pick_tts(ms, sys.argv[3] if len(sys.argv) > 3 else None)
        text = scenes[0]['say'] + ' ' + scenes[1]['say']
        info = {'model': model, 'text': text, 'voices': {}}
        for v in SAMPLE_VOICES:
            pcm, rate = synth(model, v, text)
            dur = save_wav(f'{out}/sample-{v}.wav', pcm, rate)
            info['voices'][v] = {'seconds': round(dur, 2), 'transcript': transcribe(text_model, f'{out}/sample-{v}.wav')}
            print(f'{v}: {dur:.1f}s', flush=True)
            json.dump(info, open(f'{out}/samples.json', 'w'), ensure_ascii=False, indent=1)
        json.dump(info, open(f'{out}/samples.json', 'w'), ensure_ascii=False, indent=1)
        return

    voice = sys.argv[3]
    model = pick_tts(ms, sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None)
    durs, trans = {}, {}
    size = -(-len(scenes) // max(1, CHUNKS))
    groups = [scenes[i:i + size] for i in range(0, len(scenes), size)]
    for gi, g in enumerate(groups):
        text = '\n\n— — —\n\n'.join(s['say'] for s in g)
        pcm, rate = synth_multi(model, voice, text) if len(g) > 1 else synth(model, voice, g[0]['say'])
        save_wav(f'{out}/chunk-{gi + 1}.wav', pcm, rate)
        parts = split_silences(pcm, rate, len(g))
        for s, piece in zip(g, parts):
            path = f'{out}/{s["id"]}.wav'
            durs[s['id']] = round(save_wav(path, piece, rate), 3)
            trans[s['id']] = transcribe(text_model, path)
            print(f'{s["id"]}: {durs[s["id"]]}s', flush=True)
        json.dump({'model': model, 'voice': voice, 'durations': durs}, open(f'{out}/durations.json', 'w'), indent=1)
        json.dump(trans, open(f'{out}/transcripts.json', 'w'), ensure_ascii=False, indent=1)
        time.sleep(5)


def synth_multi(model, voice, text):
    global STYLE
    keep = STYLE
    STYLE = STYLE_MULTI + STYLE
    try:
        return synth(model, voice, text)
    finally:
        STYLE = keep


def split_silences(pcm, rate, n):
    """يقسم الصوت إلى n قطعة عند أطول n-1 فترات صمت (بلا مكتبات خارجية)"""
    import array
    a = array.array('h'); a.frombytes(pcm)
    win = int(rate * 0.02)
    rms = []
    for i in range(0, len(a) - win, win):
        seg = a[i:i + win]
        rms.append((sum(x * x for x in seg[::4]) / max(1, len(seg[::4]))) ** 0.5)
    if n <= 1:
        return [pcm]
    peak = max(rms) or 1
    quiet = [r < peak * 0.02 for r in rms]
    runs, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            runs.append((j - i, i, j))
            i = j
        else:
            i += 1
    # تجاهل الصمت في البداية والنهاية
    runs = [r for r in runs if r[1] > 5 and r[2] < len(quiet) - 5]
    cuts = sorted(sorted(runs, reverse=True)[:n - 1], key=lambda r: r[1])
    if len(cuts) < n - 1:
        raise SystemExit(f'could not find {n - 1} pauses (found {len(cuts)})')
    pieces, start = [], 0
    for _, a0, b0 in cuts:
        # اترك ٠٫٢٥ث من الصمت على جانبي القطع
        end = min(b0, a0 + int(0.25 / 0.02)) * win
        pieces.append(pcm[start * 2:end * 2])
        start = max(a0, b0 - int(0.25 / 0.02)) * win
    pieces.append(pcm[start * 2:])
    return pieces


if __name__ == '__main__':
    main()
