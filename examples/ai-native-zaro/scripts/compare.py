"""Build timestamp-matched reference / HTML / difference inspection sheets."""

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / ".beam/verification"
REFERENCE = ROOT / "references/frames"


def main():
    samples = json.loads((REFERENCE / "index.json").read_text())
    rows = []
    metrics = []
    for sample in samples:
        name = sample["file"]
        with Image.open(REFERENCE / name) as reference, Image.open(OUTPUT / name) as reconstruction:
            reference = reference.convert("RGB")
            reconstruction = reconstruction.convert("RGB")
            difference = ImageChops.difference(reference, reconstruction)
            metrics.append(dict(frame=sample["frame"], timeMs=sample["timeMs"],
                                meanAbsoluteChannelError=sum(ImageStat.Stat(difference).mean) / 3))
            row = Image.new("RGB", (1440, 298), "#edeee4")
            draw = ImageDraw.Draw(row)
            for index, (picture, label) in enumerate([(reference, "REFERENCE"), (reconstruction, "HTML / GSAP"),
                                                     (difference, "PIXEL DIFFERENCE")]):
                row.paste(picture.resize((480, 270)), (480 * index, 0))
                draw.text((480 * index + 10, 278), f"{sample['timeMs']/1000:.3f}s  {label}", fill="#1d1113")
            rows.append(row)
    sheets = []
    for start in range(0, len(rows), 8):
        group = rows[start:start + 8]
        sheet = Image.new("RGB", (1440, len(group) * 298), "#edeee4")
        for index, row in enumerate(group):
            sheet.paste(row, (0, index * 298))
        name = f"comparison-{start // 8 + 1:02d}.jpg"
        sheet.save(OUTPUT / name, quality=90)
        sheets.append(name)
    (OUTPUT / "comparison.json").write_text(json.dumps(dict(
        note="These metrics expose differences, not a claim of pixel-identical reconstruction.", samples=metrics
    ), indent=2) + "\n")
    (OUTPUT / "comparison.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>Zaro reference comparison</title>'
        '<style>body{margin:24px;background:#1d1113;color:#edeee4;font:18px Arial}'
        'img{display:block;max-width:100%;margin:20px 0}h1{font-size:24px}</style>'
        '<h1>Zaro: reference · HTML / GSAP · pixel difference</h1>'
        '<p>Identical source timestamps. This inspection does not assert pixel-identical fidelity.</p>'
        + ''.join(f'<img src="{name}" alt="Timestamp comparison sheet {index+1}">' for index, name in enumerate(sheets))
    )
    print(json.dumps(dict(comparedFrames=len(metrics), sheets=len(sheets), viewer=str(OUTPUT / "comparison.html")), indent=2))


if __name__ == "__main__":
    main()
