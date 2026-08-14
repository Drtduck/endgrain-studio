#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор иконок разделов приложения в фирменном стиле Endgrain Studio.

Стиль задаёт маскот-бобёр (public/brand/beaver-logo.png, beaver-mark.png):
толстый тёмный контур, плоская заливка без градиентов, приглушённая палитра
(зелёный #14594a, тёплое дерево, охра, кремовый #f0ede7), без фотореализма.

Подход:
1. Каждая иконка генерируется через Gemini image-модель (gemini-3-pro-image)
   на сплошном пурпурном фоне (#FF00FF) - это chroma-key, а не финальный цвет.
2. Локально на PIL фон вырезается заливкой (flood fill) от углов картинки:
   находим все пиксели, "дотягивающиеся" от углов через похожие на пурпурный
   тона, помечаем их прозрачными. Дальше идёт despill (убираем розовый
   паразитный оттенок на кромке силуэта) и обрезка по bounding box силуэта
   с полями 4-8%, ресайз в финальные 256x256.

Запуск:
    export $(grep -m1 '^GEMINI_API_KEY=' .env.local)
    python3 scripts/section-icons.py            # сгенерировать все 9 иконок
    python3 scripts/section-icons.py home editor # только выбранные ключи

Ключ читается из .env.local в корне репозитория (переменная GEMINI_API_KEY),
если он не установлен явно в окружении.
"""

import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env.local"
OUT_DIR = REPO_ROOT / "public" / "brand" / "icons"

MODEL = "gemini-3-pro-image"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

FINAL_SIZE = 256
PADDING_FRAC = 0.06  # 6% полей с каждой стороны после обрезки по силуэту
MAX_RETRIES = 3
RETRY_PAUSE_SEC = 10
BETWEEN_REQUESTS_SEC = 4

# Общая часть промпта - стиль, палитра, ограничения. Держит все иконки
# одним семейством, как у маскота-бобра.
STYLE_BLOCK = """
Flat vector sticker icon, die-cut sticker style, thick uniform dark outline
(#2a1c10, stroke weight consistent across the whole shape), flat solid color
fills with NO gradients, NO shading, NO photorealism, NO texture noise,
NO drop shadow, NO text or letters anywhere in the image.
Muted warm woodworking color palette only: deep forest green #14594a,
warm honey wood tone #b9793f, light birch wood #d9b581, ochre/mustard accent
#c99a3a, dark walnut outline #2a1c10, small cream highlight #f0ede7 used
sparingly for shine only.
Simple, bold, friendly, slightly chunky shapes readable at small size,
centered composition, single main subject, generous empty margin around
the subject (subject occupies about 80% of the frame, not touching edges).
Background: a single flat solid magenta color #FF00FF filling the entire
canvas edge to edge, completely uniform, no vignette, no texture on the
background.
Square 1:1 composition.
"""

ICONS = {
    "home": (
        "A cozy carpenter's workshop scene as an icon: a wooden workbench "
        "with a vise, a hand plane and a small potted plant on top, "
        "a hanging pendant lamp above it. Represents the app home / overview."
    ),
    "editor": (
        "A square end-grain cutting board pattern icon: a neat grid of small "
        "square wood tiles in alternating warm wood and dark walnut tones, "
        "like a checkerboard end-grain pattern, seen from straight above. "
        "Represents the pattern editor."
    ),
    "templates": (
        "A short stack of three square wood sample tiles, each with a "
        "slightly different end-grain pattern on top, fanned out a little "
        "like a stack of coasters. Represents ready-made pattern templates."
    ),
    "generate": (
        "A small end-grain wood pattern square with a magic sparkle / spark "
        "burst of small stars above it, suggesting an AI generator creating "
        "the pattern. Represents automatic pattern generation."
    ),
    "photo": (
        "A simple retro camera icon next to a small square end-grain wood "
        "board, as if the camera just photographed the board to turn it "
        "into a pattern. Represents generating a pattern from a photo."
    ),
    "view3d": (
        "An isometric 3D view of a finished rectangular cutting board "
        "standing on its edge, with visible depth and a small drop line "
        "showing thickness, like a 3D render turntable icon. Represents "
        "the 3D board preview."
    ),
    "books": (
        "A small stack of two closed books lying flat with one wood-handled "
        "chisel resting diagonally on top. Represents woodworking reference "
        "books and materials."
    ),
    "promo": (
        "A small gift-shaped sticker label with a ribbon bow, next to a "
        "round promo sticker showing a tiny end-grain wood pattern circle. "
        "Represents promo materials and merch."
    ),
    "projects": (
        "A simple file folder icon, slightly open, with the corner of a "
        "rolled-up blueprint / technical drawing sheet with a wood-pattern "
        "grid sticking out of it. Represents saved projects."
    ),
}


def load_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(
        "Не нашёл GEMINI_API_KEY ни в окружении, ни в .env.local"
    )


def request_image(prompt: str, api_key: str) -> bytes:
    """Запрашивает у Gemini одно изображение 1:1 на пурпурном фоне."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"},
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{API_URL}?key={api_key}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            parts = body["candidates"][0]["content"]["parts"]
            for part in parts:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline:
                    return base64.b64decode(inline["data"])
            raise RuntimeError(f"В ответе нет картинки: {body}")
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, KeyError) as e:
            last_err = e
            print(f"  попытка {attempt}/{MAX_RETRIES} не удалась: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_PAUSE_SEC)
    raise RuntimeError(f"Не удалось получить картинку после {MAX_RETRIES} попыток: {last_err}")


def is_magenta_like(r, g, b) -> bool:
    # Пурпурный chroma-key и его окрестность (лёгкий джипег/кодек-шум).
    return r > 140 and b > 140 and g < 140 and (min(r, b) - g) > 40


def remove_chroma_background(im: Image.Image) -> Image.Image:
    """Заливка от углов: помечает прозрачным весь фон, связанный с углами,
    похожий по цвету на пурпурный chroma-key. Плюс despill кромки."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    visited = bytearray(w * h)
    stack = []
    for x in (0, w - 1):
        for y in range(h):
            stack.append((x, y))
    for y in (0, h - 1):
        for x in range(w):
            stack.append((x, y))

    bg_mask = bytearray(w * h)
    while stack:
        x, y = stack.pop()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, a = px[x, y]
        if not is_magenta_like(r, g, b):
            continue
        bg_mask[idx] = 1
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if bg_mask[idx]:
                px[x, y] = (0, 0, 0, 0)

    # Despill: у пикселей рядом с прозрачной областью, ещё несущих розовый
    # оттенок, приглушаем канал R/B в сторону серого, чтобы не было ореола.
    src = im.copy()
    spx = src.load()
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if bg_mask[idx]:
                continue
            r, g, b, a = spx[x, y]
            if r > 130 and b > 130 and (min(r, b) - g) > 15:
                near_transparent = False
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and bg_mask[ny * w + nx]:
                            near_transparent = True
                if near_transparent:
                    avg = g
                    px[x, y] = (avg, avg, avg, a)

    return im


def crop_to_silhouette(im: Image.Image, padding_frac: float, final_size: int) -> Image.Image:
    """Обрезает по bounding box непрозрачных пикселей и добавляет ровные
    поля, чтобы силуэт не упирался в край финального квадрата."""
    bbox = im.getbbox()
    if bbox is None:
        return im.resize((final_size, final_size), Image.LANCZOS)

    left, top, right, bottom = bbox
    cropped = im.crop(bbox)
    cw, ch = cropped.size
    side = max(cw, ch)

    # Квадратный холст вокруг силуэта, силуэт по центру.
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)

    pad = int(side * padding_frac)
    padded_side = side + pad * 2
    padded = Image.new("RGBA", (padded_side, padded_side), (0, 0, 0, 0))
    padded.paste(canvas, (pad, pad), canvas)

    return padded.resize((final_size, final_size), Image.LANCZOS)


def transparency_ratio(im: Image.Image) -> float:
    alpha = im.split()[-1]
    hist = alpha.histogram()
    total = sum(hist)
    zero = hist[0]
    return zero / total if total else 0.0


def margin_ok(im: Image.Image, min_frac=0.03, max_frac=0.20) -> bool:
    """Проверяет, что вокруг силуэта есть разумные поля (не обрезан по краю
    и не потерялся в центре крошечной точкой)."""
    bbox = im.getbbox()
    if bbox is None:
        return False
    left, top, right, bottom = bbox
    w, h = im.size
    margins = [left, top, w - right, h - bottom]
    fracs = [m / w for m in margins]
    return all(f >= min_frac for f in fracs) and min(fracs) <= max_frac + 0.5


def generate_icon(key: str, description: str, api_key: str) -> Path:
    prompt = STYLE_BLOCK + "\nSubject: " + description
    print(f"[{key}] запрашиваю картинку...")
    raw = request_image(prompt, api_key)

    tmp_path = OUT_DIR / f"_raw_{key}.png"
    tmp_path.write_bytes(raw)
    im = Image.open(tmp_path).convert("RGBA")

    im = remove_chroma_background(im)
    im = crop_to_silhouette(im, PADDING_FRAC, FINAL_SIZE)

    out_path = OUT_DIR / f"{key}.png"
    im.save(out_path)
    tmp_path.unlink(missing_ok=True)

    ratio = transparency_ratio(im)
    ok_margin = margin_ok(im)
    print(f"[{key}] сохранено -> {out_path} (прозрачность {ratio:.1%}, поля ок: {ok_margin})")
    return out_path


def main():
    api_key = load_api_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    keys = sys.argv[1:] or list(ICONS.keys())
    unknown = [k for k in keys if k not in ICONS]
    if unknown:
        raise SystemExit(f"Неизвестные ключи иконок: {unknown}. Доступны: {list(ICONS.keys())}")

    for i, key in enumerate(keys):
        generate_icon(key, ICONS[key], api_key)
        if i < len(keys) - 1:
            time.sleep(BETWEEN_REQUESTS_SEC)


if __name__ == "__main__":
    main()
