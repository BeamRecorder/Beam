import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "../../apps/cli/src/index.ts");
const source =
  "/home/albi/Vidéos/Beam/user/projects/studio/project-quiet-aurora-4";
const target =
  "/home/albi/Vidéos/Beam/user/projects/studio/project-quiet-aurora-4-studio-overview";
const sourceBytes = readFileSync(resolve(source, "project.json"));
const original = JSON.parse(sourceBytes);
const temporary = resolve(root, ".beam/project");
mkdirSync(temporary, { recursive: true });
const resume = process.argv.includes("--resume");
if (
  existsSync(target) &&
  (!resume || existsSync(resolve(target, "project.json")))
)
  throw new Error("The separate Studio overview project already exists.");
if (!resume) {
  mkdirSync(target);
  for (const folder of [
    "media",
    ...original.sessions.map((session) => session.relativePath),
  ])
    cpSync(resolve(source, folder), resolve(target, folder), {
      recursive: true,
    });
}
const createdAtUtc = new Date().toISOString();
const clone = resume
  ? JSON.parse(readFileSync(resolve(temporary, "cloned.json")))
  : {
      ...original,
      projectId: randomUUID(),
      name: "Quiet Aurora 4 — Studio overview",
      createdAtUtc,
      updatedAtUtc: createdAtUtc,
      previewSrc: null,
    };
const { projectId } = clone;
for (const session of clone.sessions) {
  const path = resolve(target, session.relativePath, "manifest.json");
  const manifest = JSON.parse(readFileSync(path));
  writeFileSync(
    path,
    JSON.stringify({ ...manifest, projectId }, null, 2) + "\n",
  );
}
let current = resolve(temporary, "cloned.json");
writeFileSync(current, JSON.stringify(clone, null, 2));
function edit(stage, commands) {
  const instructions = resolve(temporary, `${stage}.commands.json`),
    output = resolve(temporary, `${stage}.json`);
  writeFileSync(instructions, JSON.stringify(commands, null, 2));
  rmSync(output, { force: true });
  const result = spawnSync(
    "bun",
    [cli, "edit", current, instructions, output],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  current = output;
  const document = JSON.parse(readFileSync(output));
  writeFileSync(
    resolve(root, `assets/${stage}.json`),
    JSON.stringify(document.editor.composition, null, 2),
  );
  return document.editor.composition;
}
const initial = edit(
  "initial",
  original.editor.composition.clips.flatMap((clip) => {
    if (
      !["screen", "webcam"].includes(clip.kind) ||
      clip.timelineStartMs >= 12000
    )
      return [{ type: "clip.delete", payload: { clipId: clip.id } }];
    return clip.timelineStartMs + clip.timelineDurationMs > 12000
      ? [
          {
            type: "clip.trim",
            payload: { clipId: clip.id, edge: "end", timeMs: 12000 },
          },
        ]
      : [];
  }),
);
const crossing = (composition, time) =>
  composition.clips.filter(
    (clip) =>
      clip.timelineStartMs < time &&
      clip.timelineStartMs + clip.timelineDurationMs > time,
  );
const trimmed = edit(
  "trimmed",
  crossing(initial, 11200).map((clip) => ({
    type: "clip.trim",
    payload: { clipId: clip.id, edge: "end", timeMs: 11200 },
  })),
);
const split = edit(
  "split",
  crossing(trimmed, 3600).map((clip) => ({
    type: "clip.split",
    payload: { clipId: clip.id, timeMs: 3600 },
  })),
);
const splitAgain = edit(
  "split-again",
  crossing(split, 4400).map((clip) => ({
    type: "clip.split",
    payload: { clipId: clip.id, timeMs: 4400 },
  })),
);
const middle = splitAgain.clips.find(
  (clip) => clip.kind === "screen" && clip.timelineStartMs === 3600,
);
const deleted = edit(
  "deleted",
  splitAgain.clips
    .filter((clip) => clip.timelineStartMs === 3600)
    .map((clip) => ({ type: "clip.delete", payload: { clipId: clip.id } })),
);
const final = edit(
  "cut",
  deleted.clips
    .filter((clip) => clip.timelineStartMs >= 4400)
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs)
    .map((clip) => ({
      type: "clip.move",
      payload: { clipId: clip.id, startMs: clip.timelineStartMs - 800 },
    })),
);
writeFileSync(
  resolve(root, ".beam/project/receipt.json"),
  JSON.stringify(
    {
      projectId,
      directory: target,
      sourceProjectId: original.projectId,
      sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      middleClipId: middle.id,
      finalScreenId: final.clips.find(
        (clip) => clip.kind === "screen" && clip.timelineStartMs === 3600,
      ).id,
    },
    null,
    2,
  ),
);
const repair = spawnSync(
  process.execPath,
  [resolve(root, "scripts/repair-recording-links.mjs")],
  { encoding: "utf8" },
);
if (repair.status !== 0) throw new Error(repair.stderr);
writeFileSync(resolve(target, "project.json"), readFileSync(current));
const frozen = JSON.parse(
  readFileSync(
    "/home/albi/Vidéos/Beam/user/marketing/feature-zooms/frozen-export.json",
  ),
).snapshot;
delete frozen.composition;
frozen.zooms = [];
frozen.zoomMotionBlur = { enabled: false, intensity: 0 };
frozen.duration = 12;
frozen.canvas.width = 1280;
frozen.canvas.height = 720;
frozen.cursorPack.cursors.forEach((cursor) => {
  cursor.url = `recorded-cursors/${cursor.url.split("/").at(-1)}`;
});
writeFileSync(resolve(root, "assets/snapshot.json"), JSON.stringify(frozen));
if (!sourceBytes.equals(readFileSync(resolve(source, "project.json"))))
  throw new Error("The original changed.");
console.log(JSON.stringify({ projectId, directory: target, stages: 7 }));
