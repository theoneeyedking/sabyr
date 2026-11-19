#!/usr/bin/env bash
# Озвучка демо синтезатором речи Piper (открытый, MIT), голос dmitri (набор данных CC0).
# Скачивает Piper и голос во временную папку, читает реплики фильма и кладёт mp3 в mobile/public/pitch/play/voice/.
# Нужны curl, tar, ffmpeg и python3. Запускайте сами: скрипт скачивает и выполняет стороннюю программу.
#
#   ./scripts/pitch_tts.sh            # голос dmitri
#   VOICE=irina ./scripts/pitch_tts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mobile/public/pitch/play/voice"
WORK="${PIPER_DIR:-${TMPDIR:-/tmp}/sabyr-piper}"
VOICE="${VOICE:-dmitri}"
MODEL="ru_RU-$VOICE-medium"

mkdir -p "$WORK" "$OUT"
if [ ! -x "$WORK/piper/piper" ]; then
  echo "Скачиваю Piper…"
  curl -fsSL -o "$WORK/piper.tgz" https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
  tar -xzf "$WORK/piper.tgz" -C "$WORK"
fi
for ext in onnx onnx.json; do
  [ -s "$WORK/$MODEL.$ext" ] || curl -fsSL -o "$WORK/$MODEL.$ext" \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$VOICE/medium/$MODEL.$ext"
done

python3 "$ROOT/scripts/pitch_voice.py" --say | while IFS=$'\t' read -r key text; do
  echo "  $key"
  printf '%s\n' "$text" | "$WORK/piper/piper" --model "$WORK/$MODEL.onnx" --output_file "$WORK/$key.wav" >/dev/null 2>&1
  ffmpeg -y -v error -i "$WORK/$key.wav" -ac 1 -b:a 96k "$OUT/$key.mp3"
done
python3 "$ROOT/scripts/pitch_voice.py"
echo "Готово. Откройте демо и послушайте; неудачные реплики можно перезаписать своим голосом."
