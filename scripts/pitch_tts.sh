#!/usr/bin/env bash
# Озвучка демо синтезатором речи. Два движка на выбор:
#   ENGINE=silero (по умолчанию) — Silero v5 (github.com/snakers4/silero-models), голоса: xenia, kseniya, baya (женские),
#                                  aidar, eugene (мужские). Звучит естественнее. Модели — CC BY-NC (некоммерческое использование).
#   ENGINE=piper                 — Piper, голоса: dmitri, denis, ruslan (мужские), irina (женский).
# Движок ставится как Python-пакет внутри Docker-образа проекта (sabyr-backend), модели скачиваются во временную папку,
# mp3 кладутся в mobile/public/pitch/play/voice/. Нужны docker, curl, ffmpeg и python3.
# Запускайте сами: скрипт скачивает и выполняет стороннюю программу (в контейнере, без доступа к проекту).
#
#   ./scripts/pitch_tts.sh --samples                # пробы всех голосов движка в ~/sabyr-golosa (демо не меняет)
#   VOICE=eugene ./scripts/pitch_tts.sh             # озвучить демо выбранным голосом
#   ENGINE=piper VOICE=denis ./scripts/pitch_tts.sh
#   SPEED=1.08 ENGINE=piper ./scripts/pitch_tts.sh  # только Piper: медленнее (1.0 — обычный темп)
#   PLAIN=1 ./scripts/pitch_tts.sh                  # без ручных ударений из data-say: движок расставит их сам
#   MOOD=friendly VOICE=aidar ./scripts/pitch_tts.sh  # только Silero, настроение голоса:
#        joyful — радостный, тон заметно выше; friendly — тон чуть выше (по умолчанию);
#        warm — выше и чуть медленнее; calm — медленнее; neutral — как есть
#   VOICE=aidar ./scripts/pitch_tts.sh --moods      # пробы всех настроений одного голоса в ~/sabyr-golosa
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mobile/public/pitch/play/voice"
WORK="${PIPER_DIR:-${TMPDIR:-/tmp}/sabyr-piper}"
ENGINE="${ENGINE:-silero}"
SPEED="${SPEED:-1.0}"
IMAGE="${PIPER_IMAGE:-sabyr-backend}"
SAMPLES_DIR="${SAMPLES_DIR:-$HOME/sabyr-golosa}"
SILERO_MODEL="${SILERO_MODEL:-v5_6_ru}"
MOOD="${MOOD:-friendly}"

case "$ENGINE" in
  silero) ALL_VOICES="xenia kseniya baya aidar eugene"; VOICE="${VOICE:-eugene}" ;;
  piper)  ALL_VOICES="dmitri denis ruslan irina"; VOICE="${VOICE:-dmitri}" ;;
  *) echo "Неизвестный движок: $ENGINE (нужен silero или piper)"; exit 1 ;;
esac

fetch() {  # fetch <файл в $WORK> <адрес>
  if [ ! -s "$WORK/$1" ]; then
    echo "Скачиваю $1…"
    curl -fsSL -o "$WORK/$1" "$2"
  fi
}
fetch_voice() {
  if [ "$ENGINE" = silero ]; then
    fetch "$SILERO_MODEL.pt" "https://models.silero.ai/models/tts/ru/$SILERO_MODEL.pt"
  else
    for ext in onnx onnx.json; do
      fetch "ru_RU-$1-medium.$ext" "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$1/medium/ru_RU-$1-medium.$ext"
    done
  fi
}

mkdir -p "$WORK/wav" "$WORK/home" "$OUT"

cat > "$WORK/synth_piper.py" <<'PY'
"""Piper: читает lines.tsv (имя<TAB>голос<TAB>текст) и пишет по wav на строку. Запускается внутри контейнера.
В parts.json попадает длительность каждого предложения — по ней демо подсвечивает слова в субтитрах."""
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice

work, speed = Path(sys.argv[1]), float(sys.argv[2])
try:                                    # новые версии пакета: параметры речи передаются объектом
    from piper import SynthesisConfig
    config = {"syn_config": SynthesisConfig(length_scale=speed)}
except ImportError:
    config = {"length_scale": speed}
voices, parts = {}, {}
for line in (work / "lines.tsv").read_text(encoding="utf-8").splitlines():
    name, speaker, text = line.split("\t", 2)
    model = f"ru_RU-{speaker}-medium"
    if model not in voices:
        voices[model] = PiperVoice.load(str(work / f"{model}.onnx"))
    voice = voices[model]
    target = work / "wav" / f"{name}.wav"
    try:                                # по предложениям: так известна длительность каждого
        chunks = list(voice.synthesize(text, **config))
        first = chunks[0]
        with wave.open(str(target), "wb") as out:
            out.setnchannels(first.sample_channels)
            out.setsampwidth(first.sample_width)
            out.setframerate(first.sample_rate)
            for chunk in chunks:
                out.writeframes(chunk.audio_int16_bytes)
        parts[name] = [round(len(c.audio_int16_bytes) / (c.sample_rate * c.sample_width * c.sample_channels), 2) for c in chunks]
    except (AttributeError, TypeError, IndexError):
        with wave.open(str(target), "wb") as out:
            if hasattr(voice, "synthesize_wav"):
                voice.synthesize_wav(text, out, **config)
            else:
                voice.synthesize(text, out, **config)
    print(" ", name, flush=True)
(work / "parts.json").write_text(json.dumps(parts, ensure_ascii=False))
PY

cat > "$WORK/synth_silero.py" <<'PY'
"""Silero: читает lines.tsv (имя<TAB>голос<TAB>текст) и пишет по wav на строку. Запускается внутри контейнера.
Каждое предложение синтезируется отдельно: так известна его длительность (parts.json) для подсветки слов."""
import array
import json
import re
import sys
import wave
from pathlib import Path

import torch

work, model_name, default_mood = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
# настроение = (темп, тон) для SSML; None — обычная речь
MOODS = {"joyful": ("medium", "x-high"), "friendly": ("medium", "high"), "warm": ("slow", "high"),
         "calm": ("slow", "medium"), "neutral": None}
ssml_ok = True
RATE = 48000
PAUSE = int(RATE * 0.22)                # пауза между предложениями
torch.set_num_threads(4)
model = torch.package.PackageImporter(str(work / f"{model_name}.pt")).load_pickle("tts_models", "model")
model.to(torch.device("cpu"))


def clean(text: str) -> str:
    """Приводит текст к виду, который понимает модель: кириллица, «+» перед ударной гласной, простая пунктуация."""
    text = re.sub("([аеёиоуыэюяАЕЁИОУЫЭЮЯ])́", r"+\1", text)   # знак ударения после гласной → «+» перед ней
    text = text.replace("́", "").replace(" — ", ", ").replace("—", ",").replace("–", ",")
    text = re.sub(r"[«»\"()]", "", text).lower()
    text = re.sub(r"[^а-яё+\-.,!?…:; ]", " ", text)
    return re.sub(r"\s+", " ", re.sub(r",\s*,", ",", text)).strip()


parts = {}
for line in (work / "lines.tsv").read_text(encoding="utf-8").splitlines():
    name, speaker, text = line.split("\t", 2)
    speaker, _, mood = speaker.partition(":")
    prosody = MOODS.get(mood or default_mood)
    sentences = re.findall(r"[^.!?…]+[.!?…]+[»\")]*\s*|[^.!?…]+$", text)
    samples, lengths = array.array("h"), []
    for n, sentence in enumerate(sentences):
        plain = clean(sentence)
        audio = None
        if prosody and ssml_ok:
            try:
                ssml = f'<speak><prosody rate="{prosody[0]}" pitch="{prosody[1]}">{plain}</prosody></speak>'
                audio = model.apply_tts(ssml_text=ssml, speaker=speaker, sample_rate=RATE)
            except Exception as error:  # модель не понимает разметку — читаем обычным голосом
                ssml_ok = False
                print(f"  настроение голоса недоступно ({type(error).__name__}: {error}); читаю без него", flush=True)
        if audio is None:
            audio = model.apply_tts(text=plain, speaker=speaker, sample_rate=RATE)
        chunk = array.array("h", audio.mul(32767).clamp(-32768, 32767).to(torch.int16).tolist())
        if n < len(sentences) - 1:
            chunk.extend([0] * PAUSE)
        samples.extend(chunk)
        lengths.append(round(len(chunk) / RATE, 2))
    with wave.open(str(work / "wav" / f"{name}.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(samples.tobytes())
    parts[name] = lengths
    print(" ", name, flush=True)
(work / "parts.json").write_text(json.dumps(parts, ensure_ascii=False))
PY

run_synth() {
  local pip="pip install -q --user --no-warn-script-location --disable-pip-version-check"
  local cmd
  if [ "$ENGINE" = silero ]; then
    cmd="$pip torch --index-url https://download.pytorch.org/whl/cpu && python /work/synth_silero.py /work $SILERO_MODEL $MOOD"
  else
    cmd="$pip piper-tts && python /work/synth_piper.py /work $SPEED"
  fi
  echo "Синтез в контейнере $IMAGE, движок $ENGINE (первый запуск ставит пакеты, это может занять несколько минут)…"
  # HOME лежит в рабочей папке: установленные пакеты сохраняются между запусками
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/work/home -v "$WORK:/work" "$IMAGE" sh -c "$cmd"
}

if [ "${1:-}" = "--samples" ]; then
  SAMPLE="Э́то Сабы́р. Он защища́ет клие́нта ба́нка в тот моме́нт, когда́ челове́к сам перево́дит де́ньги моше́ннику. Запуска́ется пятнадцатимину́тная па́уза, а её сы́ну Дания́ру ухо́дит про́сьба посмотре́ть на перево́д."
  : > "$WORK/lines.tsv"
  fetch_voice "$VOICE"
  for v in $ALL_VOICES; do
    [ "$ENGINE" = piper ] && fetch_voice "$v"
    printf 'sample-%s\t%s\t%s\n' "$v" "$v" "$SAMPLE" >> "$WORK/lines.tsv"
  done
  run_synth
  mkdir -p "$SAMPLES_DIR"
  for v in $ALL_VOICES; do ffmpeg -y -v error -i "$WORK/wav/sample-$v.wav" -ac 1 -b:a 96k "$SAMPLES_DIR/$ENGINE-$v.mp3"; done
  echo "Пробы голосов лежат в $SAMPLES_DIR — послушайте и запустите: ENGINE=$ENGINE VOICE=<имя> ./scripts/pitch_tts.sh"
  ls "$SAMPLES_DIR"
  exit 0
fi

if [ "${1:-}" = "--moods" ]; then
  [ "$ENGINE" = silero ] || { echo "Настроения есть только у движка silero"; exit 1; }
  SAMPLE="Здра́вствуйте! Э́то Сабы́р. Он бережёт ва́ши де́ньги в тот моме́нт, когда́ моше́нник угова́ривает перевести́ их самому́. Полтора́ миллио́на оста́лись до́ма!"
  : > "$WORK/lines.tsv"
  fetch_voice "$VOICE"
  for m in joyful friendly warm calm neutral; do printf 'mood-%s\t%s:%s\t%s\n' "$m" "$VOICE" "$m" "$SAMPLE" >> "$WORK/lines.tsv"; done
  run_synth
  mkdir -p "$SAMPLES_DIR"
  for m in joyful friendly warm calm neutral; do ffmpeg -y -v error -i "$WORK/wav/mood-$m.wav" -ac 1 -b:a 96k "$SAMPLES_DIR/$VOICE-$m.mp3"; done
  echo "Пробы настроений лежат в $SAMPLES_DIR — послушайте и запустите: MOOD=<имя> VOICE=$VOICE ./scripts/pitch_tts.sh"
  ls "$SAMPLES_DIR" | grep "^$VOICE-"
  exit 0
fi

fetch_voice "$VOICE"
python3 "$ROOT/scripts/pitch_voice.py" --say | awk -F'\t' -v v="$VOICE" '{ print $1 "\t" v "\t" $2 }' > "$WORK/lines.tsv"
run_synth

count=0
while IFS=$'\t' read -r key _ _; do
  ffmpeg -y -v error -i "$WORK/wav/$key.wav" -ac 1 -b:a 96k "$OUT/$key.mp3"
  count=$((count + 1))
done < "$WORK/lines.tsv"
cp "$WORK/parts.json" "$OUT/parts.json"
python3 "$ROOT/scripts/pitch_voice.py"
echo "Готово: $count реплик, движок $ENGINE, голос $VOICE, настроение $MOOD. Откройте демо и послушайте."
