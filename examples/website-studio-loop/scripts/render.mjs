import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const theme = process.argv[2];
if (!["light", "dark"].includes(theme))
  throw new Error("Choose light or dark.");
mkdirSync(resolve(root, ".beam"), { recursive: true });
mkdirSync(resolve(root, "renders"), { recursive: true });
const name = `editing-studio-${theme}`,
  output = resolve(root, `renders/${name}.mp4`);
const job = resolve(root, `.beam/${name}-motion.json`);
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: `../dist/${theme}/index.html`,
      width: 1600,
      height: 1000,
      duration: 12,
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
  {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (result.status !== 0) throw new Error("Beam motion export failed.");
writeFileSync(resolve(root, `.beam/${name}-diagnostics.json`), result.stdout);
console.log(`Rendered ${name}: 720 frames, 1600 × 1000, 60 fps.`);
