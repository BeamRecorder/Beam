# HTML and TypeScript compositions

Create a self-contained source folder with an HTML entry, TypeScript, styles and local
assets. Vue is optional (`framework: "vue"`); the default `framework: "html"` compiles
ordinary HTML + TypeScript with Vite. No Vue component or editor mount is required.
Install dependencies such as GSAP in the source project. Vite config files and external
CDN requests are not used. Keep shader code, fonts and media references local.

## Publish a static composition to Screenshot

```html
<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
.card{position:absolute;inset:100px;border-radius:40px;background:#111;color:white;padding:80px;font:64px sans-serif}</style>
</head><body><div class="card">Beam feature</div>
<script type="module" src="./main.ts"></script></body></html>
```

Static HTML can omit a clock. If WebGL initializes asynchronously, expose a `ready`
promise on `window.beamComposition` so Beam waits for initialization before capturing.
The renderer also waits for local fonts, image decoding and compositor frames.

```json
{
  "projectId": "SCREENSHOT_UUID",
  "expectedRevision": 0,
  "entry": "./composition/index.html",
  "width": 1920,
  "height": 1080,
  "durationMs": 0,
  "name": "Feature card"
}
```

```sh
beam tools call html.publish @publish.json
```

The response contains `layerId`, the new revision and an `html` source descriptor.
To change that same layer, add its `layerId` and update `expectedRevision` from a fresh
snapshot. Geometry, layer order, visibility, effects and existing timeline trims are
preserved. The published PNG is a real rendered derivative; the project retains source
and bundle versions for reopening, undo/redo and deterministic exports.

## Animate a 15-second video with GSAP

TypeScript can expose the clock without any Vue dependency:

```ts
import { gsap } from 'gsap';

const timeline = gsap.timeline({ paused: true });
timeline.fromTo('.card', { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 1 }, 0);
timeline.to('.card', { scale: 1.08, duration: 10 }, 1);
timeline.to('.card', { opacity: 0, duration: 1 }, 14);

Object.assign(window, {
  beamComposition: { seek(timeMs: number) { timeline.time(timeMs / 1000, false); } },
});
```

Publish to an open video project with `durationMs: 15000` and optionally `fps: 30`.
The new clip initially fills the canvas and spans that duration. Beam can place captions,
other media and zooms around it using standard document commands. A static video layer
(`durationMs: 0`) initially spans five seconds; change its clip timing with commands.
Updating HTML preserves the clip's timing; use `clip.patch` / trim commands when changing
the authored duration should also change the timeline.
Static sources always use time zero. Extending an animated clip past the source's authored
duration holds its final frame, consistently in preview and export.

For WebGL, implement `seek(timeMs)` by setting shader uniforms and drawing the completed
frame. It must work for arbitrary times, including reverse seeks; do not depend on wall
clock time, accumulated simulation ticks, random unseeded values or an independent loop.
Use a renderable WebGL canvas (for example `preserveDrawingBuffer: true`) and return a
promise from `seek` if GPU/resource preparation is asynchronous. Animated HTML without
`seek` fails explicitly. Initialization and each frame have a bounded deadline.

## References and live code changes

Include reference files inside the composition folder. Alternatively add:

```json
{"references":[{"name":"feature.png","source":"./screenshots/feature.png"}]}
```

They are frozen under `references/` beside the HTML. Reference them using
`./references/feature.png` in HTML/TS. Dependencies are resolved from the source project's
nearest `node_modules`; that directory is excluded from saved source versions.
Reference `source` can also be a `project-media:` URL from a Beam document or project
thumbnail. Add its `projectId` when referencing another saved project; the CLI resolves
and copies that project-owned file before compiling. HTML never accesses Beam's private
media protocol directly.
Composition trees reject symlinks and are bounded to 2,048 files / 128 MiB per tree.

```sh
beam html watch @publish.json
```

Watch publishes once, remembers the layer ID and republishes on subsequent source saves.
It reads the current revision before each publication and coalesces rapid saves while
compiling. Keep this process running while the agent writes HTML/TypeScript; changes
appear in the open editor after compilation. Ctrl+C closes the watchers. Compilation,
renderer and revision errors are printed, leaving the previous layer available.
Full-canvas animated HTML scenes preview directly in Chromium inside the editor,
without per-frame PNG capture or shared GPU textures. Beam supplies the source time
from its audio clock; play, pause, reverse seeks, trimming and playback rate retain the
same `seek(timeMs)` contract. The iframe has an opaque origin and no Beam preload,
filesystem access, network/RPC, popups or nested frames. Imported audio remains on
Beam's timeline; preview HTML media is muted.

This direct presentation applies to one full-canvas HTML visual, with matching output
aspect ratio and no additional visual layers, Beam frame/border/shadow, camera effects,
watermark or transitions. Compositions requiring Beam's layer compositor use exact
coalesced pixel frames. Export, thumbnails and explicit screenshot actions always
request exact frames from the same frozen source. Export requests every timeline frame.

Use `html.source` with the layer's descriptor to locate its saved source. Copy it into a
working folder with the necessary dependencies before editing; published versions are
immutable inputs to preview/export. Source revisions remain in the project while undo
history or exports may reference them. In this version, unused source revisions are not
automatically garbage-collected.
