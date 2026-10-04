import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
    throw new Error(
      "External ffmpeg optimization failed. Install ffmpeg with WebP and VP9 support.",
    );
}
for (const theme of ["light", "dark"]) {
  const name = `editing-timeline-${theme}`;
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
    "300",
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
  resolve(website, "media/editing-timeline.NOTICE.txt"),
  "Beam Shape the pace — an illustrated editing timeline.\n" +
    "5 seconds, 1280 × 800, 60 fps, intentionally silent.\n" +
    "Uses Beam’s real timeline painter, trim handle, UI buttons and theme tokens.\n" +
    "Cursor: unchanged Beam macOS arrow and horizontal-resize SVGs, with native pack geometry/hotspots.\n" +
    "Existing macOS cursor assets retain their applicable rights; no new license is claimed.\n" +
    "Fixed background: Beam Ember preset, painted with Beam’s gradient renderer.\n" +
    "Preview/thumbnail artwork: user-supplied Beam — Beautiful Captures project, exported with Beam CLI.\n" +
    "Source: Beam repository, examples/website-editing-loop/ (MPL-2.0).\n" +
    "Hanken Grotesk is licensed under the SIL OFL. Platform marks and dependencies retain their own rights.\n" +
    "Not a screen recording of editor operations; the clips and waveform are illustrative.\n",
);
console.log("Wrote both themed loops and posters to the private website.");
