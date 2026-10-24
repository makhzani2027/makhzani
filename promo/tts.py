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
SAMPLE_VOICES = ['Charon', 'Orus', 'Iapetus', 'Algieba', 'Sadaltager', 'Gacrux']


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
        return

    voice = sys.argv[3]
    model = pick_tts(ms, sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None)
    durs, trans = {}, {}
    for s in scenes:
        path = f'{out}/{s["id"]}.wav'
        pcm, rate = synth(model, voice, s['say'])
        durs[s['id']] = round(save_wav(path, pcm, rate), 3)
        trans[s['id']] = transcribe(text_model, path)
        print(f'{s["id"]}: {durs[s["id"]]}s', flush=True)
        time.sleep(2)
    json.dump({'model': model, 'voice': voice, 'durations': durs}, open(f'{out}/durations.json', 'w'), indent=1)
    json.dump(trans, open(f'{out}/transcripts.json', 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
