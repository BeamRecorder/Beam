"""Extract reproducible reference frames, UI crops and the original soundtrack.

Requires ffmpeg, ffprobe and Pillow. --all also writes every input video frame.
These frames are reference material; the composition never plays them as a video.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "references"


def command(*arguments):
    result = subprocess.run(arguments, capture_output=True)
    if result.returncode:
        raise RuntimeError(arguments[0] + " failed: " + result.stderr.decode(errors="replace")[:4000])
    return result.stdout


def alpha_crop(image, mode):
    if not mode:
        return image
    result = Image.new("RGBA", image.size)
    pixels = []
    for index, (r, g, b) in enumerate(image.convert("RGB").get_flattened_data()):
        if mode == "paper-logo":
            alpha = max(0, min(255, (237 - max(r, g, b)) * 255 // 210))
            pixels.append((29, 17, 19, alpha))
        elif mode == "brown-key":
            distance = max(abs(r - 80), abs(g - 69), abs(b - 66))
            pixels.append((r, g, b, max(0, min(255, (distance - 20) * 8))))
        elif mode == "map-dark":
            x, y = index % image.width, index // image.width
            is_background = max(r, g, b) < 120 and not (280 < x < 1650 and 405 < y < 625)
            pixels.append((r, g, b, 255) if is_background else (29, 17, 19, 255))
        elif mode == "map-paper":
            x, y = index % image.width, index // image.width
            is_map = y > 760 and not (660 < x < 1258 and 868 < y < 954)
            alpha = max(0, min(100, (237 - min(r, g, b)) * 6)) if is_map else 0
            pixels.append((180, 183, 171, alpha))
        else:
            raise ValueError("Unknown crop alpha mode: " + mode)
    result.putdata(pixels)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Extract every original input frame")
    parser.add_argument("--source", type=Path, default=REFERENCE / "video/zaro-template.webm",
                        help="Reference video; use the original MP4 for exact original pixels")
    arguments = parser.parse_args()
    video = arguments.source.resolve()
    for executable in ["ffmpeg", "ffprobe"]:
        if not shutil.which(executable):
            raise RuntimeError("Install " + executable + " before extracting references.")
    timestamps = json.loads(command(
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(video)
    ))["frames"]
    times = [float(frame["best_effort_timestamp_time"]) * 1000 for frame in timestamps]
    crops = json.loads((REFERENCE / "ui/manifest.json").read_text())
    samples = sorted(set(range(0, len(times), 30)) | {0, 15, 45, 165})
    required = set(samples) | {crop["sourceFrame"] for crop in crops}
    selected = list(range(len(times))) if arguments.all else sorted(required)
    frames = REFERENCE / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    (ROOT / ".beam").mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="reference-", dir=ROOT / ".beam") as temporary:
        destination = Path(temporary)
        filters = "1" if arguments.all else "+".join("eq(n," + str(frame) + ")" for frame in selected)
        command("ffmpeg", "-v", "error", "-i", str(video), "-vf", "select='" + filters + "'",
                "-fps_mode", "vfr", str(destination / "%05d.png"))
        for ordinal, frame in enumerate(selected, 1):
            shutil.move(destination / f"{ordinal:05d}.png", frames / f"frame-{frame:04d}.png")
    for crop in crops:
        with Image.open(frames / f"frame-{crop['sourceFrame']:04d}.png") as image:
            alpha_crop(image.crop(crop["crop"]), crop.get("alphaMode")).save(REFERENCE / "ui" / crop["file"])
    (REFERENCE / "audio").mkdir(exist_ok=True)
    command("ffmpeg", "-v", "error", "-y", "-i", str(video), "-vn", "-c:a", "aac", "-b:a", "192k",
            str(REFERENCE / "audio/zaro-reference.m4a"))
    (frames / "timestamps.json").write_text(json.dumps(times, indent=2) + "\n")
    index = [dict(frame=frame, timeMs=times[frame], file=f"frame-{frame:04d}.png") for frame in samples]
    (frames / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    provenance = dict(source=video.name, sha256=hashlib.sha256(video.read_bytes()).hexdigest(),
                      width=1920, height=1080, durationMs=68600, inputFrames=len(times), outputFps=30,
                      audio="Original reference soundtrack, not certified CC0")
    (REFERENCE / "source.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(dict(extractedFrames=len(selected), uiCrops=len(crops), source=provenance), indent=2))


if __name__ == "__main__":
    main()
