import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";

const theme = process.argv[2] || "dark";
if (!["light", "dark"].includes(theme))
  throw new Error("Choose light or dark.");
mkdirSync(resolve(root, ".beam"), { recursive: true });
mkdirSync(resolve(root, "renders"), { recursive: true });
const output = resolve(root, `renders/editing-canvas-${theme}.mp4`);
// A standalone motion job specifies the delivery cadence without changing the
// open editor's frame-rate settings. It uses the same compiled source and Beam renderer.
const job = resolve(root, `.beam/${theme}-motion.json`);
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: `../dist/${theme}/index.html`,
      width: 1280,
      height: 800,
      duration: 7,
      fps: 60,
      format: "mp4",
      preset: "high",
    },
    null,
    2,
  ),
);
const result = spawnSync(
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
if (result.status !== 0) throw new Error("Beam motion export failed.");
const poster = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    output,
    "-frames:v",
    "1",
    resolve(root, `renders/editing-canvas-${theme}.png`),
  ],
  { stdio: "inherit" },
);
if (poster.status !== 0)
  throw new Error(
    "Export succeeded, but extracting its poster requires external ffmpeg.",
  );
