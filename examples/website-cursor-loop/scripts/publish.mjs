import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { call, root } from "./beam-cli.mjs";

const theme = process.argv[2] || "dark";
if (!["light", "dark"].includes(theme))
  throw new Error("Choose light or dark.");
const stateFile = resolve(root, `.beam/${theme}-project.json`);
mkdirSync(resolve(root, ".beam"), { recursive: true });
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, "utf8"))
  : {
      projectId: call("projects.create", {
        kind: "video",
        name: `Website — A cursor that feels considered · ${theme}`,
        width: 1280,
        height: 800,
      }).id,
    };
writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
if (!call("projects.list").open.some((p) => p.projectId === state.projectId)) {
  call("projects.open", {
    projectId: state.projectId,
    kind: "video",
    disposition: "new-window",
  });
}
let snapshot;
for (let attempt = 0; attempt < 60; attempt++) {
  if (call("projects.list").open.some((p) => p.projectId === state.projectId)) {
    snapshot = call("documents.snapshot", { projectId: state.projectId });
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!snapshot) throw new Error("The independent Beam editor is not ready.");
// Freeze the actual compiled Beam components, plus authored source as references.
const stage = resolve(root, `.beam/publish-${theme}`);
await rm(stage, { recursive: true, force: true });
await cp(resolve(root, "dist", theme), stage, { recursive: true });
await mkdir(resolve(stage, "references"), { recursive: true });
for (const name of [
  "src",
  ".media",
  "BRIEF.md",
  "README.md",
  "package.json",
  "bun.lock",
  "assets",
]) {
  await cp(resolve(root, name), resolve(stage, "references", name), {
    recursive: true,
  });
}
const published = call("html.publish", {
  projectId: state.projectId,
  expectedRevision: snapshot.revision,
  entry: `./.beam/publish-${theme}/index.html`,
  width: 1280,
  height: 800,
  durationMs: 12000,
  fps: 60,
  name: `A cursor that feels considered · ${theme} · HTML / GSAP`,
  ...(state.layerId ? { layerId: state.layerId } : {}),
});
state.layerId = published.layerId;
writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
snapshot = call("documents.snapshot", { projectId: state.projectId });
const clip = snapshot.document.composition.clips.find(
  (item) => item.id === state.layerId,
);
call("documents.transact", {
  projectId: state.projectId,
  expectedRevision: snapshot.revision,
  operationId: randomUUID(),
  commands: [
    {
      type: "render.patch",
      payload: {
        canvas: {
          ...snapshot.document.canvas,
          preset: "custom",
          width: 1280,
          height: 800,
          showBackground: false,
          watermark: { ...snapshot.document.canvas.watermark, enabled: false },
          transitions: { entry: null, exit: null },
        },
        blurPercent: 0,
        zooms: [],
      },
    },
    {
      type: "clip.patch",
      payload: {
        clipId: state.layerId,
        patch: {
          transform: { x: 0, y: 0, width: 1, height: 1 },
          appearance: {
            ...clip.appearance,
            frame: "none",
            cornerRadius: 0,
            shadowSize: "none",
            borderEnabled: false,
          },
          timelineStartMs: 0,
          timelineDurationMs: 12000,
          sourceDurationMs: 12000,
          transitions: { entry: null, exit: null },
        },
      },
    },
  ],
});
console.log(JSON.stringify({ theme, ...state }, null, 2));
