import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const receipt = JSON.parse(
  readFileSync(resolve(root, ".beam/project/receipt.json")),
);
const target = resolve(receipt.directory, "project.json");
const source =
  "/home/albi/Vidéos/Beam/user/projects/studio/project-quiet-aurora-4/project.json";
if (
  createHash("sha256").update(readFileSync(source)).digest("hex") !==
  receipt.sourceSha256
)
  throw new Error("The source project changed during authoring.");
const current = JSON.parse(readFileSync(target)),
  final = JSON.parse(readFileSync(resolve(root, ".beam/final-state.json")));
if (current.projectId !== receipt.projectId)
  throw new Error("Refusing to replace a different project.");
const commands = final.composition.clips.map((clip) => {
  const existing = current.editor.composition.clips.find(
    (item) => item.id === clip.id,
  );
  if (!existing) return { type: "clip.add", payload: clip };
  const { id, kind, ...patch } = clip;
  return { type: "clip.patch", payload: { clipId: id, patch } };
});
const instructions = resolve(root, ".beam/project/final.commands.json"),
  output = resolve(root, ".beam/project/final.json");
writeFileSync(instructions, JSON.stringify(commands, null, 2));
rmSync(output, { force: true });
const result = spawnSync(
  "bun",
  [
    resolve(root, "../../apps/cli/src/index.ts"),
    "edit",
    target,
    instructions,
    output,
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) throw new Error(result.stderr);
const project = JSON.parse(readFileSync(output));
project.editor.zoom = {
  ...project.editor.zoom,
  elements: final.snapshot.zooms,
  generatedSessions: [],
  motionBlur: { enabled: false, intensity: 0 },
};
project.editor.presentation = {
  ...project.editor.presentation,
  selectedBackgroundId: "gradient:ocean",
  background: {
    id: "gradient:ocean",
    name: "Ocean",
    ...final.snapshot.background,
  },
};
project.updatedAtUtc = new Date().toISOString();
const temporary = target + ".studio.tmp";
writeFileSync(temporary, JSON.stringify(project, null, 2) + "\n");
renameSync(temporary, target);
console.log(
  JSON.stringify({
    projectId: receipt.projectId,
    name: project.name,
    clips: project.editor.composition.clips.length,
    duration: 10.4,
    sourceUnchanged: true,
  }),
);
