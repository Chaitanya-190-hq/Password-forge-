#!/usr/bin/env python3
"""Generate Password Forge PWA icons from a vector-style drawing.

Run from the project root:  python3 scripts/generate-icons.py
Outputs PNGs into public/icons/. Requires Pillow.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (17, 18, 22, 255)
GOLD = (197, 163, 107, 255)
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
SUPERSAMPLE = 4


def shield_points(cx: float, top: float, width: float, height: float, corner: float):
    """Rounded-top shield silhouette as a polygon, tip pointing down."""
    left, right = cx - width / 2, cx + width / 2
    points = []

    # Top-left rounded corner (180° → 270°).
    for i in range(10):
        angle = math.pi + i * (math.pi / 2) / 9
        points.append((left + corner + corner * math.cos(angle), top + corner + corner * math.sin(angle)))
    # Top-right rounded corner (270° → 360°).
    for i in range(10):
        angle = -math.pi / 2 + i * (math.pi / 2) / 9
        points.append((right - corner + corner * math.cos(angle), top + corner + corner * math.sin(angle)))

    shoulder = top + height * 0.52
    points.append((right, shoulder))
    # Right side curving to the tip.
    steps = 16
    for i in range(1, steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * right + 2 * (1 - t) * t * right + t**2 * cx
        y = (1 - t) ** 2 * shoulder + 2 * (1 - t) * t * (top + height * 0.82) + t**2 * (top + height)
        points.append((x, y))
    # Left side back up.
    for i in range(steps - 1, 0, -1):
        t = i / steps
        x = (1 - t) ** 2 * left + 2 * (1 - t) * t * left + t**2 * cx
        y = (1 - t) ** 2 * shoulder + 2 * (1 - t) * t * (top + height * 0.82) + t**2 * (top + height)
        points.append((x, y))
    points.append((left, shoulder))
    return points


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    work = size * SUPERSAMPLE
    image = Image.new("RGBA", (work, work), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if maskable:
        # Full-bleed background: safe zone for adaptive masks.
        draw.rectangle([0, 0, work, work], fill=BG)
    else:
        radius = int(work * 0.22)
        draw.rounded_rectangle([0, 0, work - 1, work - 1], radius=radius, fill=BG)
        draw.rounded_rectangle(
            [0, 0, work - 1, work - 1],
            radius=radius,
            outline=(197, 163, 107, 70),
            width=max(1, int(work * 0.007)),
        )

    height = work * (0.50 if maskable else 0.57)
    width = height * 0.76
    cx = work / 2
    top = (work - height) / 2 + height * 0.03

    draw.polygon(shield_points(cx, top, width, height, width * 0.22), fill=GOLD)

    inset = width * 0.085
    draw.polygon(
        shield_points(cx, top + inset, width - inset * 2, height - inset * 1.7, (width - inset * 2) * 0.22),
        fill=BG,
    )

    # Keyhole.
    key_radius = width * 0.115
    key_y = top + height * 0.40
    draw.ellipse(
        [cx - key_radius, key_y - key_radius, cx + key_radius, key_y + key_radius],
        fill=GOLD,
    )
    draw.polygon(
        [
            (cx - key_radius * 0.55, key_y + key_radius * 0.5),
            (cx + key_radius * 0.55, key_y + key_radius * 0.5),
            (cx + key_radius * 0.95, key_y + key_radius * 2.45),
            (cx - key_radius * 0.95, key_y + key_radius * 2.45),
        ],
        fill=GOLD,
    )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = {
        "icon-192.png": draw_icon(192),
        "icon-512.png": draw_icon(512),
        "icon-maskable-512.png": draw_icon(512, maskable=True),
        "apple-touch-icon.png": draw_icon(180, maskable=True).convert("RGB"),
    }
    for name, image in outputs.items():
        path = OUT_DIR / name
        image.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(OUT_DIR.parent.parent)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
