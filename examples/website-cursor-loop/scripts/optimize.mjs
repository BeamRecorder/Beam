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
  const name = `editing-cursor-${theme}`;
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
  resolve(website, "media/editing-cursor.NOTICE.txt"),
  "Beam — A cursor that feels considered.\n" +
    "12 seconds, 1280 × 800, 60 fps, intentionally silent.\n" +
    "Authored input events illustrate Beam’s actual deterministic cursor motion player, spring, motion blur and ripples. This is not a captured recording.\n" +
    "Native UI primitives, complete macOS and bundled Material Bibata Noir cursor artwork retain their applicable rights.\n" +
    "Uses original cursor hotspots, automatic point, click, text, move, resize, selection, disabled and help roles and Beam’s fixed Tide gradient renderer.\n" +
    "Source: Beam repository, examples/website-cursor-loop/ (MPL-2.0). Hanken Grotesk: SIL OFL.\n",
);
console.log("Wrote both cursor loops and posters to the private website.");
