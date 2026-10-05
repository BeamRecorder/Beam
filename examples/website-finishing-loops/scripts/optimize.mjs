import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";
const website = resolve(root, "../../apps/website-private/public");
mkdirSync(resolve(website, "media"), { recursive: true });
mkdirSync(resolve(website, "images/features"), { recursive: true });
function ffmpeg(args) {
  return new Promise((ok, fail) => {
    const child = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { stdio: "inherit" },
    );
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0
        ? ok()
        : fail(new Error("External FFmpeg derivative encoding failed.")),
    );
  });
}
await Promise.all(
  ["transitions", "export"].flatMap((mode) =>
    ["dark", "light"].map(async (theme) => {
      const name = `editing-${mode}-${theme}`;
      await ffmpeg([
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
        "2",
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
      await ffmpeg([
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
    }),
  ),
);
for (const mode of ["transitions", "export"])
  writeFileSync(
    resolve(website, `media/editing-${mode}.NOTICE.txt`),
    `Beam — ${mode === "transitions" ? "Keep the story moving." : "Finish with a file you own."}\n8 seconds, 1280 × 800, 60 fps, intentionally silent.\nAuthored HTML/Vue/GSAP illustration using native Beam controls, transition compositor and timeline painters, unchanged macOS cursors and native spring/ripples.\nExport progress is illustrative, not a benchmark; no destination dialogs or backend exports run inside the composition.\nSource: Beam examples/website-finishing-loops (MPL-2.0). Hanken Grotesk: SIL OFL. Tahoe and Beautiful Captures artwork retain original applicable rights.\nExternal FFmpeg only creates derivatives; no FFmpeg binaries or libraries are bundled.\n`,
  );
console.log(
  "Wrote transitions and export loops, both themes and matching posters.",
);
