import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "../../apps/cli/src/index.ts");
export function call(tool, input = {}) {
  const instance = process.env.BEAM_INSTANCE;
  const result = spawnSync(
    "bun",
    [
      cli,
      "tools",
      "call",
      tool,
      JSON.stringify(input),
      ...(instance ? ["--instance", instance] : []),
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || `Beam CLI failed: ${tool}`,
    );
  return JSON.parse(result.stdout);
}
