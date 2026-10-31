"""
Generate the Google Play store listing graphics for RushArena.

Run from mobile/:
    python scripts/generate-store-assets.py

Outputs:
    store-assets/play-icon-512.png
    store-assets/feature-graphic-1024x500.png
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "store-assets"

BG_TOP = (15, 10, 46)
BG_BOTTOM = (26, 17, 71)
WHITE = (255, 255, 255)
GOLD = (251, 191, 36)
MUTED = (157, 147, 214)
ORANGE = (249, 115, 22)


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)


def gradient(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    width, height = size
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return image.convert("RGBA")


def make_icon() -> None:
    icon = Image.open(ASSETS / "icon.png").convert("RGB")
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(
        OUT / "play-icon-512.png", "PNG", optimize=True
    )


def make_feature_graphic() -> None:
    width, height = 1024, 500
    image = gradient((width, height))

    # Reuse the transparent adaptive icon so the stopwatch sits directly on
    # the gradient instead of on a visible square.
    mark = Image.open(ASSETS / "adaptive-icon.png").convert("RGBA")
    mark = mark.resize((390, 390), Image.Resampling.LANCZOS)
    image.alpha_composite(mark, (34, 55))

    draw = ImageDraw.Draw(image, "RGBA")

    title_font = load_font(r"C:\Windows\Fonts\arialbd.ttf", 96)
    tagline_font = load_font(r"C:\Windows\Fonts\seguisb.ttf", 30)
    detail_font = load_font(r"C:\Windows\Fonts\seguisb.ttf", 22)

    draw.text((470, 145), "RushArena", font=title_font, fill=(*WHITE, 255))
    draw.text(
        (475, 270),
        "60 SECONDS. ONE WINNER.",
        font=tagline_font,
        fill=(*GOLD, 255),
    )

    # Small accent bar.
    draw.rounded_rectangle((478, 325, 560, 333), radius=4, fill=(*ORANGE, 255))
    draw.text(
        (475, 350),
        "SIX QUICK GAMES  ·  DAILY RUN  ·  LEADERBOARD",
        font=detail_font,
        fill=(*MUTED, 255),
    )

    image.convert("RGB").save(
        OUT / "feature-graphic-1024x500.png", "PNG", optimize=True
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_icon()
    make_feature_graphic()
    for path in sorted(OUT.glob("*.png")):
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
