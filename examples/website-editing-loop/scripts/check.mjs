import { spawnSync } from "node:child_process";
import { root } from "./beam-cli.mjs";
for (const theme of ["dark", "light"]) {
  const result = spawnSync(
    "npx",
    ["--yes", "hyperframes@0.8.122", "check", `dist/${theme}`],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(`HyperFrames ${theme} validation failed.`);
}
