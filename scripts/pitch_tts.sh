#!/usr/bin/env bash
# Озвучка демо синтезатором речи Piper. Голоса: dmitri, denis, ruslan (мужские), irina (женский).
# Piper ставится как Python-пакет внутри Docker-образа проекта (sabyr-backend), файлы голоса скачиваются во
# временную папку, mp3 кладутся в mobile/public/pitch/play/voice/. Нужны docker, curl, ffmpeg и python3.
# Запускайте сами: скрипт скачивает и выполняет стороннюю программу (в контейнере, без доступа к проекту).
#
#   ./scripts/pitch_tts.sh --samples      # пробы всех голосов: послушать и выбрать (в демо ничего не меняет)
#   VOICE=ruslan ./scripts/pitch_tts.sh   # озвучить демо выбранным голосом
#   SPEED=1.08 VOICE=denis ./scripts/pitch_tts.sh   # медленнее (1.0 — обычный темп, больше — медленнее)
#   PLAIN=1 ./scripts/pitch_tts.sh           # без знаков ударения из data-say (если голос на них спотыкается)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mobile/public/pitch/play/voice"
WORK="${PIPER_DIR:-${TMPDIR:-/tmp}/sabyr-piper}"
VOICE="${VOICE:-dmitri}"
SPEED="${SPEED:-1.0}"
IMAGE="${PIPER_IMAGE:-sabyr-backend}"
ALL_VOICES="dmitri denis ruslan irina"

fetch_voice() {
  local model="ru_RU-$1-medium"
  for ext in onnx onnx.json; do
    if [ ! -s "$WORK/$model.$ext" ]; then
      echo "Скачиваю голос $model.$ext…"
      curl -fsSL -o "$WORK/$model.$ext" "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$1/medium/$model.$ext"
    fi
  done
}

mkdir -p "$WORK/wav" "$OUT"
cat > "$WORK/synth.py" <<'PY'
"""Читает lines.tsv (имя<TAB>голос<TAB>текст) и пишет по wav на строку. Запускается внутри контейнера.
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
    name, model, text = line.split("\t", 2)
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

run_synth() {
  echo "Синтез в контейнере $IMAGE (ставит пакет piper-tts)…"
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp/home -v "$WORK:/work" "$IMAGE" sh -c \
    "pip install -q --user --no-warn-script-location --disable-pip-version-check piper-tts && python /work/synth.py /work $SPEED"
}

if [ "${1:-}" = "--samples" ]; then
  SAMPLE="Это Сабыр. Он защищает клиента банка в тот момент, когда человек сам переводит деньги мошеннику. Запускается пятнадцатиминутная пауза, а её сыну Данияру уходит просьба посмотреть на перевод."
  : > "$WORK/lines.tsv"
  for v in $ALL_VOICES; do
    fetch_voice "$v"
    printf 'sample-%s\tru_RU-%s-medium\t%s\n' "$v" "$v" "$SAMPLE" >> "$WORK/lines.tsv"
  done
  run_synth
  mkdir -p "$WORK/samples"
  for v in $ALL_VOICES; do ffmpeg -y -v error -i "$WORK/wav/sample-$v.wav" -ac 1 -b:a 96k "$WORK/samples/$v.mp3"; done
  echo "Пробы голосов лежат в $WORK/samples/ — послушайте и запустите: VOICE=<имя> ./scripts/pitch_tts.sh"
  ls "$WORK/samples"
  exit 0
fi

fetch_voice "$VOICE"
python3 "$ROOT/scripts/pitch_voice.py" --say | awk -F'\t' -v m="ru_RU-$VOICE-medium" '{ print $1 "\t" m "\t" $2 }' > "$WORK/lines.tsv"
run_synth

count=0
while IFS=$'\t' read -r key _ _; do
  ffmpeg -y -v error -i "$WORK/wav/$key.wav" -ac 1 -b:a 96k "$OUT/$key.mp3"
  count=$((count + 1))
done < "$WORK/lines.tsv"
cp "$WORK/parts.json" "$OUT/parts.json"
python3 "$ROOT/scripts/pitch_voice.py"
echo "Готово: $count реплик голосом $VOICE. Откройте демо и послушайте."
