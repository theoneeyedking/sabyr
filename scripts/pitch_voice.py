#!/usr/bin/env python3
"""Озвучка демо на странице проекта (mobile/public/pitch/play/).

Без записанных дорожек демо читает реплики голосом браузера. Чтобы озвучить своим голосом:

  python scripts/pitch_voice.py --list     # какие реплики записать и как назвать файлы
  # запишите каждую реплику в mobile/public/pitch/play/voice/<ключ>.mp3 (или .m4a, .ogg, .wav)
  python scripts/pitch_voice.py            # собрать voice.json: длительности берутся через ffprobe

Можно записать только часть реплик: остальные прочитает голос браузера.
"""
import json
import os
import re
import subprocess
import sys
from html import unescape
from pathlib import Path

PLAY = Path(__file__).resolve().parents[1] / "mobile" / "public" / "pitch" / "play"
VOICE = PLAY / "voice"
EXTENSIONS = (".mp3", ".m4a", ".ogg", ".wav")
SAY = "--say" in sys.argv   # печатать реплики в написании «как читать вслух», по строке: ключ<TAB>текст


def lines() -> list[tuple[str, str]]:
    """Реплики фильма в порядке показа: (ключ, текст)."""
    html = (PLAY / "index.html").read_text(encoding="utf-8")
    out = []
    for slide in re.finditer(r'<section class="slide" id="([\w-]+)"([^>]*)>(.*?)</section>', html, re.S):
        if "data-film" not in slide.group(2):
            continue
        for note in re.finditer(r'<p data-s="(\d+)"([^>]*)>(.*?)</p>', slide.group(3), re.S):
            text = unescape(re.sub(r"<[^>]+>", "", note.group(3))).strip()
            say = re.search(r'data-say="([^"]*)"', note.group(2))
            # для синтезатора берётся data-say (как читать вслух), для диктора-человека — сам текст
            out.append((f"{slide.group(1)}-{note.group(1)}", unescape(say.group(1)) if say and SAY else text))
    return out


def duration(path: Path) -> float:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                            capture_output=True, text=True, check=True)
    return round(float(result.stdout.strip()), 2)


def main() -> None:
    script = lines()
    if SAY:
        plain = os.environ.get("PLAIN") == "1"   # PLAIN=1 — без знаков ударения (если синтезатор их не понимает)
        for key, text in script:
            print(f"{key}\t{text.replace(chr(0x301), '') if plain else text}")
        return
    if "--list" in sys.argv:
        for key, text in script:
            print(f"{key}.mp3\n    {text}\n")
        print(f"Всего реплик: {len(script)}. Файлы кладите в {VOICE}")
        return
    VOICE.mkdir(exist_ok=True)
    parts_file = VOICE / "parts.json"   # пишет scripts/pitch_tts.sh
    parts = json.loads(parts_file.read_text(encoding="utf-8")) if parts_file.exists() else {}
    manifest = {}
    for key, _ in script:
        found = next((VOICE / f"{key}{ext}" for ext in EXTENSIONS if (VOICE / f"{key}{ext}").exists()), None)
        if found:
            manifest[key] = {"file": found.name, "dur": duration(found)}
            if key in parts:   # длительность каждого предложения — для точной подсветки слов в субтитрах
                manifest[key]["parts"] = parts[key]
    (VOICE / "voice.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Записано дорожек: {len(manifest)} из {len(script)}; остальные прочитает голос браузера.")


if __name__ == "__main__":
    main()
