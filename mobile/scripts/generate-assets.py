"""
Generate the MINUTE WAR app icon, Android adaptive foreground, monochrome
icon and splash screen.

Run from mobile/:
    python scripts/generate-assets.py

Requires Pillow (`pip install Pillow`). The output files are committed so a
normal EAS build does not need Python. Re-run this only when the brand art
changes.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parent.parent / "assets"
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")
FONT_SEMI = Path(r"C:\Windows\Fonts\seguisb.ttf")

BG_TOP = (15, 10, 46)
BG_BOTTOM = (26, 17, 71)
ORANGE = (249, 115, 22)
ORANGE_LIGHT = (251, 146, 60)
GOLD = (251, 191, 36)
WHITE = (255, 255, 255)
MUTED = (157, 147, 214)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    """Use a Windows font when available, with a portable fallback."""
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)


def vertical_gradient(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(
            round(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3)
        )
        draw.line([(0, y), (width, y)], fill=color)
    return image


def add_glow(image: Image.Image, center: tuple[int, int], radius: int) -> Image.Image:
    """A cheap radial glow built from concentric translucent circles."""
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    cx, cy = center
    for r in range(radius, 0, -18):
        alpha = int(26 * (1 - r / radius) ** 1.6)
        if alpha > 0:
            draw.ellipse(
                (cx - r, cy - r, cx + r, cy + r),
                fill=(ORANGE[0], ORANGE[1], ORANGE[2], alpha),
            )
    return Image.alpha_composite(image.convert("RGBA"), glow)


def draw_stopwatch(
    draw: ImageDraw.ImageDraw,
    size: int,
    *,
    color: tuple[int, int, int],
    ring_only: bool = False,
    scale: float = 1.0,
) -> None:
    """Draw the timer ring, crown and 60-second face."""
    cx = cy = size / 2
    # Proportions are relative to the canvas so the same drawing works for a
    # 1024 px store icon, a 900 px splash mark and a 64 px favicon.
    radius = int(size * 0.285 * scale)
    stroke = max(2, int(size * 0.051 * scale))
    ring_box = (cx - radius, cy - radius, cx + radius, cy + radius)

    # A soft outer ring makes the icon feel less flat at small sizes.
    if not ring_only:
        draw.arc(
            (
                ring_box[0] - stroke * 0.45,
                ring_box[1] - stroke * 0.45,
                ring_box[2] + stroke * 0.45,
                ring_box[3] + stroke * 0.45,
            ),
            start=0,
            end=360,
            fill=(*color, 50),
            width=stroke,
        )

    draw.arc(ring_box, start=0, end=360, fill=(*color, 255), width=stroke)

    # Tick marks, like a stopwatch face.
    tick_outer = max(2, radius - stroke * 0.15)
    tick_inner = max(1, radius - stroke * 1.2)
    tick_width = max(1, int(size * 0.008 * scale))
    for index in range(12):
        angle = math.radians(index * 30)
        x1 = cx + math.cos(angle) * tick_inner
        y1 = cy + math.sin(angle) * tick_inner
        x2 = cx + math.cos(angle) * tick_outer
        y2 = cy + math.sin(angle) * tick_outer
        dot = max(1, tick_width // 2)
        draw.line((x1, y1, x2, y2), fill=(*GOLD, 230), width=tick_width)
        draw.ellipse((x2 - dot, y2 - dot, x2 + dot, y2 + dot), fill=(*GOLD, 230))

    if ring_only:
        return

    # Crown / start button above the dial.
    crown_w = size * 0.068 * scale
    draw.rounded_rectangle(
        (
            cx - crown_w / 2,
            cy - radius - size * 0.082 * scale,
            cx + crown_w / 2,
            cy - radius + size * 0.006 * scale,
        ),
        radius=size * 0.018 * scale,
        fill=(*color, 255),
    )
    draw.rounded_rectangle(
        (
            cx - size * 0.02 * scale,
            cy - radius - size * 0.109 * scale,
            cx + size * 0.02 * scale,
            cy - radius - size * 0.068 * scale,
        ),
        radius=size * 0.01 * scale,
        fill=(*color, 255),
    )

    # The big 60. Arial Bold has the weight we want at 48 px.
    face = font(FONT_BOLD, max(8, int(size * 0.322 * scale)))
    draw.text(
        (cx, cy + size * 0.012 * scale),
        "60",
        font=face,
        fill=(*WHITE, 255),
        anchor="mm",
    )

    # Small accent underline, kept inside the dial.
    underline_w = size * 0.109 * scale
    draw.rounded_rectangle(
        (
            cx - underline_w / 2,
            cy + radius * 0.57,
            cx + underline_w / 2,
            cy + radius * 0.57 + size * 0.01 * scale,
        ),
        radius=size * 0.005 * scale,
        fill=(*ORANGE_LIGHT, 255),
    )


def make_icon() -> Image.Image:
    size = 1024
    image = vertical_gradient((size, size))
    image = add_glow(image, (size // 2, size // 2), 560)
    draw = ImageDraw.Draw(image, "RGBA")
    draw_stopwatch(draw, size, color=ORANGE)
    return image.convert("RGB")


def make_adaptive_foreground() -> Image.Image:
    size = 1024
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    draw_stopwatch(draw, size, color=ORANGE, scale=0.78)
    return image


def make_monochrome() -> Image.Image:
    size = 1024
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    draw_stopwatch(draw, size, color=WHITE, scale=0.78)
    return image


def make_splash() -> Image.Image:
    width, height = 1284, 2778
    image = vertical_gradient((width, height))
    image = add_glow(image, (width // 2, 1130), 700)
    draw = ImageDraw.Draw(image, "RGBA")

    # Draw the mark at 0.78 scale, then center it above the wordmark.
    logo_size = 900
    logo = Image.new("RGBA", (logo_size, logo_size), (0, 0, 0, 0))
    logo_draw = ImageDraw.Draw(logo, "RGBA")
    draw_stopwatch(logo_draw, logo_size, color=ORANGE, scale=0.78)
    image.alpha_composite(logo, ((width - logo_size) // 2, 710))

    title_font = font(FONT_BOLD, 94)
    draw.text(
        (width // 2, 1780),
        "MINUTE WAR",
        font=title_font,
        fill=(*WHITE, 255),
        anchor="mm",
    )

    tag_font = font(FONT_SEMI, 28)
    draw.text(
        (width // 2, 1870),
        "60 SECONDS. ONE WINNER.",
        font=tag_font,
        fill=(*GOLD, 255),
        anchor="mm",
    )

    url_font = font(FONT_SEMI, 24)
    draw.text(
        (width // 2, 2580),
        "minutewar.in",
        font=url_font,
        fill=(*MUTED, 255),
        anchor="mm",
    )

    return image.convert("RGB")


def make_favicon() -> Image.Image:
    size = 64
    image = vertical_gradient((size, size))
    draw = ImageDraw.Draw(image, "RGBA")
    draw_stopwatch(draw, size, color=ORANGE, scale=0.9)
    return image.convert("RGB")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    outputs = {
        "icon.png": make_icon(),
        "adaptive-icon.png": make_adaptive_foreground(),
        "monochrome-icon.png": make_monochrome(),
        "splash.png": make_splash(),
        "favicon.png": make_favicon(),
    }

    for name, image in outputs.items():
        path = ASSETS / name
        image.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(ASSETS.parent)} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
