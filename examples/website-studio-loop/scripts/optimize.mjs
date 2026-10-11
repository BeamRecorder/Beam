import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2]) throw new Error("Provide the website-private directory.");
const website = resolve(process.argv[2]),
  media = resolve(website, "public/media"),
  images = resolve(website, "public/images/features");
mkdirSync(media, { recursive: true });
mkdirSync(images, { recursive: true });
function ffmpeg(args) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error("External FFmpeg optimization failed.");
}
for (const theme of ["light", "dark"]) {
  const name = `editing-studio-${theme}`,
    output = resolve(media, `${name}.webm`);
  ffmpeg([
    "-i",
    resolve(root, `renders/${name}.mp4`),
    "-an",
    "-vf",
    "scale=1280:800:flags=lanczos",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "38",
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-threads",
    "8",
    "-cpu-used",
    "4",
    output,
  ]);
  ffmpeg([
    "-i",
    output,
    "-ss",
    "13.4",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "86",
    resolve(images, `${name}.webp`),
  ]);
  console.log(`${name}: ${statSync(output).size} bytes`);
}
writeFileSync(
  resolve(media, "editing-studio.NOTICE.txt"),
  `Beam — Studio overview
15 seconds, 1280 × 800, 60 fps, intentionally silent VP9. Light/dark variants.
1600 × 1000 MP4 masters remain in the editable source project.
Native EditorTitlebar, TimelineToolbar, TimelineAddMenu, TimelineTrimHandle, TimelineGapButtons,
ClipPropertiesPanel, CaptionClipPanel, CanvasBackgroundTabs, and native paintTimelineCanvas.
Actual Quiet Aurora 4 recording, original cursor telemetry and Beam demo webcam fixture.
Native renderCompositionFrame, screen/webcam layout, caption styling, shadow and 2D camera evaluator.
Offline Beam CLI authoring trims, splits and cuts an independent project; original source unchanged.
Two restrained camera views hold through edits; the final recording zoom enters progressively.
Illustrated editing gestures, not measured latency. No invented audio waveform or transcript.
Tahoe/Ventura backgrounds from Beam wallpaper catalog; Ocean gradient from Beam background catalog.
Native macOS cursor sprites. Hanken Grotesk: SIL OFL. Webcam fixture: existing Beam CC0 media.
Editable source: examples/website-studio-loop (MPL-2.0).
Rendered through Beam WebCodecs/Mediabunny; external FFmpeg creates website derivatives.
`,
);
