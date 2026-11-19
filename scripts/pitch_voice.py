#!/usr/bin/env python3
"""Озвучка демо на странице проекта (mobile/public/pitch/play/).

Без записанных дорожек демо читает реплики голосом браузера. Чтобы озвучить своим голосом:

  python scripts/pitch_voice.py --list     # какие реплики записать и как назвать файлы
  # запишите каждую реплику в mobile/public/pitch/play/voice/<ключ>.mp3 (или .m4a, .ogg, .wav)
  python scripts/pitch_voice.py            # собрать voice.json: длительности берутся через ffprobe

Можно записать только часть реплик: остальные прочитает голос браузера.
"""
import json
import re
import subprocess
import sys
from html import unescape
from pathlib import Path

PLAY = Path(__file__).resolve().parents[1] / "mobile" / "public" / "pitch" / "play"
VOICE = PLAY / "voice"
EXTENSIONS = (".mp3", ".m4a", ".ogg", ".wav")


def lines() -> list[tuple[str, str]]:
    """Реплики фильма в порядке показа: (ключ, текст)."""
    html = (PLAY / "index.html").read_text(encoding="utf-8")
    out = []
    for slide in re.finditer(r'<section class="slide" id="([\w-]+)"([^>]*)>(.*?)</section>', html, re.S):
        if "data-film" not in slide.group(2):
            continue
        for note in re.finditer(r'<p data-s="(\d+)"[^>]*>(.*?)</p>', slide.group(3), re.S):
            out.append((f"{slide.group(1)}-{note.group(1)}", unescape(re.sub(r"<[^>]+>", "", note.group(2))).strip()))
    return out


def duration(path: Path) -> float:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                            capture_output=True, text=True, check=True)
    return round(float(result.stdout.strip()), 2)


def main() -> None:
    script = lines()
    if "--list" in sys.argv:
        for key, text in script:
            print(f"{key}.mp3\n    {text}\n")
        print(f"Всего реплик: {len(script)}. Файлы кладите в {VOICE}")
        return
    VOICE.mkdir(exist_ok=True)
    manifest = {}
    for key, _ in script:
        found = next((VOICE / f"{key}{ext}" for ext in EXTENSIONS if (VOICE / f"{key}{ext}").exists()), None)
        if found:
            manifest[key] = {"file": found.name, "dur": duration(found)}
    (VOICE / "voice.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Записано дорожек: {len(manifest)} из {len(script)}; остальные прочитает голос браузера.")


if __name__ == "__main__":
    main()
