import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";
const website = resolve(root, "../../apps/website-private/public");
mkdirSync(resolve(website, "media"), { recursive: true });
mkdirSync(resolve(website, "images/features"), { recursive: true });
function ffmpeg(args) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error("External FFmpeg derivative encoding failed.");
}
for (const mode of ["captions", "audio"]) {
  for (const theme of ["dark", "light"]) {
    const name = `editing-${mode}-${theme}`;
    ffmpeg([
      "-i",
      resolve(root, `renders/${name}.mp4`),
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "32",
      "-b:v",
      "0",
      "-row-mt",
      "1",
      "-threads",
      "4",
      "-deadline",
      "good",
      "-cpu-used",
      "4",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "240",
      resolve(website, `media/${name}.webm`),
    ]);
    ffmpeg([
      "-i",
      resolve(root, `renders/${name}.png`),
      "-c:v",
      "libwebp",
      "-quality",
      "86",
      "-compression_level",
      "6",
      resolve(website, `images/features/${name}.webp`),
    ]);
  }
  writeFileSync(
    resolve(website, `media/editing-${mode}.NOTICE.txt`),
    `Beam — ${mode === "captions" ? "Your words, beautifully readable." : "Give the story its voice."}\n8 seconds, 1280 × 800, 60 fps, intentionally silent.\nAuthored HTML/Vue/GSAP illustration using native Beam UI, caption and timeline painters, unchanged macOS cursors and native spring/ripples.\nGeneration and recording interactions are illustrated; no live microphone or Whisper model runs in the composition.\nWaveforms derive from local generated speech PCM and Empacotatron by Fupi (CC0); original applicable rights are retained.\nSource: Beam examples/website-speech-loops (MPL-2.0). Hanken Grotesk: SIL OFL. Tahoe artwork retains applicable original rights.\nExternal FFmpeg only creates derivatives; no FFmpeg binaries or libraries are bundled.\n`,
  );
}
console.log(
  "Wrote the captions and audio loops, both themes and matching posters.",
);
