#!/usr/bin/env bash
# Озвучка демо синтезатором речи Piper, голос dmitri (набор данных CC0).
# Piper ставится как Python-пакет внутри Docker-образа проекта (sabyr-backend), файлы голоса скачиваются во
# временную папку, mp3 кладутся в mobile/public/pitch/play/voice/. Нужны docker, curl, ffmpeg и python3.
# Запускайте сами: скрипт скачивает и выполняет стороннюю программу (в контейнере, без доступа к проекту).
#
#   ./scripts/pitch_tts.sh              # голос dmitri
#   VOICE=irina ./scripts/pitch_tts.sh  # женский голос
#   SPEED=1.08 ./scripts/pitch_tts.sh   # медленнее (1.0 — обычный темп, больше — медленнее)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mobile/public/pitch/play/voice"
WORK="${PIPER_DIR:-${TMPDIR:-/tmp}/sabyr-piper}"
VOICE="${VOICE:-dmitri}"
SPEED="${SPEED:-1.0}"
MODEL="ru_RU-$VOICE-medium"
IMAGE="${PIPER_IMAGE:-sabyr-backend}"

mkdir -p "$WORK/wav" "$OUT"
for ext in onnx onnx.json; do
  if [ ! -s "$WORK/$MODEL.$ext" ]; then
    echo "Скачиваю голос $MODEL.$ext…"
    curl -fsSL -o "$WORK/$MODEL.$ext" "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$VOICE/medium/$MODEL.$ext"
  fi
done

python3 "$ROOT/scripts/pitch_voice.py" --say > "$WORK/lines.tsv"
cat > "$WORK/synth.py" <<'PY'
"""Читает lines.tsv (ключ<TAB>текст) и пишет по wav на реплику. Запускается внутри контейнера."""
import sys
import wave
from pathlib import Path

from piper import PiperVoice

work, model, speed = Path(sys.argv[1]), sys.argv[2], float(sys.argv[3])
voice = PiperVoice.load(str(work / f"{model}.onnx"))
try:                                    # новые версии пакета: параметры речи передаются объектом
    from piper import SynthesisConfig
    config = {"syn_config": SynthesisConfig(length_scale=speed)}
except ImportError:
    config = {"length_scale": speed}
for line in (work / "lines.tsv").read_text(encoding="utf-8").splitlines():
    key, text = line.split("\t", 1)
    with wave.open(str(work / "wav" / f"{key}.wav"), "wb") as out:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, out, **config)
        else:                           # старые версии пакета
            voice.synthesize(text, out, **config)
    print(" ", key, flush=True)
PY

echo "Синтез в контейнере $IMAGE (первый запуск ставит пакет piper-tts)…"
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp/home -v "$WORK:/work" "$IMAGE" sh -c \
  "pip install -q --user piper-tts && python /work/synth.py /work $MODEL $SPEED"

count=0
while IFS=$'\t' read -r key _; do
  ffmpeg -y -v error -i "$WORK/wav/$key.wav" -ac 1 -b:a 96k "$OUT/$key.mp3"
  count=$((count + 1))
done < "$WORK/lines.tsv"
python3 "$ROOT/scripts/pitch_voice.py"
echo "Готово: $count реплик. Откройте демо и послушайте; неудачные реплики можно перезаписать своим голосом."
