import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const stage of ["split", "split-again", "deleted", "cut"]) {
  const path = resolve(root, `.beam/project/${stage}.json`),
    document = JSON.parse(readFileSync(path));
  const clips = document.editor.composition.clips;
  const commands = clips
    .filter((clip) => clip.kind === "webcam")
    .map((clip) => {
      const owner = clips.find(
        (screen) =>
          screen.kind === "screen" &&
          screen.timelineStartMs <= clip.timelineStartMs &&
          screen.timelineStartMs + screen.timelineDurationMs >
            clip.timelineStartMs,
      );
      if (!owner)
        throw new Error("A camera fragment has no active screen owner.");
      return {
        type: "clip.patch",
        payload: { clipId: clip.id, patch: { recordingClipId: owner.id } },
      };
    });
  const instructions = resolve(
      root,
      `.beam/project/${stage}-links.commands.json`,
    ),
    output = resolve(root, `.beam/project/${stage}-links.json`);
  writeFileSync(instructions, JSON.stringify(commands));
  rmSync(output, { force: true });
  const result = spawnSync(
    "bun",
    [
      resolve(root, "../../apps/cli/src/index.ts"),
      "edit",
      path,
      instructions,
      output,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  const linked = JSON.parse(readFileSync(output));
  writeFileSync(path, JSON.stringify(linked, null, 2));
  writeFileSync(
    resolve(root, `assets/${stage}.json`),
    JSON.stringify(linked.editor.composition, null, 2),
  );
}
console.log(
  "Camera fragments keep their actual screen ownership through both splits and the cut.",
);
