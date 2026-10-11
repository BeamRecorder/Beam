import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, ".beam/checks"), { recursive: true });
for (const theme of ["light", "dark"]) {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "hyperframes@0.8.140",
      "check",
      resolve(root, `dist/${theme}`),
      "--at",
      "0,1.8,3.2,4.6,5.3,7.1,9.1,10.4,12.1,13.6,15",
      "--json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  writeFileSync(resolve(root, `.beam/checks/${theme}.json`), result.stdout);
  if (result.status !== 0) throw new Error(result.stdout || result.stderr);
  const report = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
  if (!report.ok) throw new Error(`${theme}: composition checks failed`);
  console.log(`${theme}: runtime, layout, motion and contrast passed`);
}
