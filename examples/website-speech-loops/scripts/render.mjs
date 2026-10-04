import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";
const mode = process.argv[2],
  theme = process.argv[3];
if (!["captions", "audio"].includes(mode) || !["dark", "light"].includes(theme))
  throw new Error("Choose captions/audio and dark/light.");
mkdirSync(resolve(root, ".beam"), { recursive: true });
mkdirSync(resolve(root, "renders"), { recursive: true });
const name = `editing-${mode}-${theme}`,
  output = resolve(root, `renders/${name}.mp4`);
const job = resolve(root, `.beam/${name}-motion.json`);
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: `../dist/${mode}-${theme}/index.html`,
      width: 1280,
      height: 800,
      duration: 8,
      fps: 60,
      format: "mp4",
      preset: "high",
    },
    null,
    2,
  ),
);
const render = spawnSync(
  "bun",
  [
    resolve(root, "../../apps/cli/src/index.ts"),
    "motion",
    job,
    output,
    "--overwrite",
  ],
  { cwd: root, stdio: "inherit" },
);
if (render.status !== 0) throw new Error("Beam motion export failed.");
const poster = spawnSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-y",
    "-i",
    output,
    "-frames:v",
    "1",
    resolve(root, `renders/${name}.png`),
  ],
  { stdio: "inherit" },
);
if (poster.status !== 0)
  throw new Error("Poster extraction requires external FFmpeg.");
