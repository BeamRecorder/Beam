import { spawnSync } from "node:child_process";
import { root } from "./beam-cli.mjs";
for (const mode of ["captions", "audio"])
  for (const theme of ["dark", "light"]) {
    const result = spawnSync(
      "npx",
      [
        "--yes",
        "hyperframes@0.8.123",
        "check",
        `dist/${mode}-${theme}`,
        "--json",
      ],
      { cwd: root, stdio: "inherit" },
    );
    if (result.status !== 0)
      throw new Error(`HyperFrames ${mode}/${theme} check failed.`);
  }
