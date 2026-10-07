from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
ICON_DIR = ROOT / "icons"
ICON_DIR.mkdir(exist_ok=True)


def make_icon(size: int) -> None:
    scale = size / 512
    image = Image.new("RGB", (size, size), "#0b110f")
    draw = ImageDraw.Draw(image)
    radius = round(112 * scale)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill="#0b110f")
    draw.ellipse(tuple(round(value * scale) for value in (88, 88, 424, 424)), fill="#123c2b")

    points = [
        (256, 54), (230, 101), (197, 143), (162, 183), (132, 224),
        (114, 266), (114, 309), (126, 345), (150, 375), (181, 394),
        (214, 398), (238, 389), (256, 375), (274, 389), (298, 398),
        (331, 394), (362, 375), (386, 345), (398, 309), (398, 266),
        (380, 224), (350, 183), (315, 143), (282, 101),
    ]
    scaled_points = [(round(x * scale), round(y * scale)) for x, y in points]
    draw.polygon(scaled_points, fill="#66e3a4")
    draw.ellipse(tuple(round(value * scale) for value in (218, 237, 294, 313)), fill="#0b110f")
    draw.rectangle(tuple(round(value * scale) for value in (238, 258, 274, 292)), fill="#66e3a4")
    draw.polygon([(round(x * scale), round(y * scale)) for x, y in ((224, 451), (288, 451), (271, 393), (241, 393))], fill="#66e3a4")
    image.save(ICON_DIR / f"app-icon-{size}.png", optimize=True)


for icon_size in (180, 192, 512):
    make_icon(icon_size)
