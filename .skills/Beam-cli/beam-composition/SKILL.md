---
name: beam-composition
description: Build or edit Beam HTML and TypeScript compositions, optionally with Vue, and publish or watch them as real video or Screenshot layers. Use Beam's deterministic clock and local asset compiler contract.
---

# Beam compositions

Read `../beam-design/SKILL.md` for new visual work and `beam-cli docs html` for the installed runtime contract. Beam does not consume HyperFrames `data-*` timelines or Remotion components as its native format.

## Choose the host

- **Live editor:** publish with `tools call html.publish @publish.json`; use `html watch @publish.json` for iterative source edits.
- **Standalone video:** render an HTML entry with `motion job.json output.mp4`.
- **Still:** publish to an image project with `durationMs: 0`, then export PNG/WebP. A static HTML source may omit the animation clock.

Start from [assets/html/index.html](assets/html/index.html) and [assets/html/main.ts](assets/html/main.ts) when a minimal deterministic source helps. Copy them into a user-owned working folder; adapt them to the brief rather than delivering the example unchanged.

## Source contract

Use ordinary HTML + TypeScript by default. `framework: "vue"` explicitly enables Vue SFC compilation. Dependencies such as GSAP must be installed in the source project's nearest `node_modules`; do not require Vue when it adds no value.

Keep fonts, images, shaders and media local. The compiler does not use the project's Vite config or fetch CDN assets. HTML runs without Node, Beam preload, filesystem access, RPC, external network, popups or nested iframes. Use document tools from the CLI host, never inside the artwork.

Animated source must expose:

```ts
Object.assign(window, {
  beamComposition: {
    seek(timeMs: number) {
      // Set the complete visual state for this exact source time.
    },
  },
});
```

Implement a real seek function, not the comment above. Follow `../beam-animation/SKILL.md` for reverse/repeated seeking, GSAP and WebGL. Expose an optional `ready` promise for asynchronous initialization; return a promise from `seek` when drawing must be awaited.

## Publication and iteration

Read [references/publish.md](references/publish.md) for complete live and standalone examples. Read `../beam-cli/references/authoring.md` for revision rules.

Read a fresh snapshot before publication. The first response returns `layerId`; retain it and supply it on updates. Otherwise every iteration inserts another layer. Updating preserves user geometry, layer order, effects and existing timeline trims. Changing authored duration does not automatically change the timeline trim.

Published source and bundles are immutable project-owned versions. Use `html.source` with the layer's saved `html` descriptor to locate them; copy into a working folder before editing. `html watch` publishes initially and republishes that same layer on saves. It keeps the previous working version when compilation fails; Ctrl+C stops the watcher.

Use `references` to freeze supplied files into the source tree, then reference `./references/NAME`. Resolve cross-project references through the tool with the owning project ID. Do not put `node_modules`, symlinks or unrelated media into source trees: a composition is limited to 2,048 files and 128 MiB.

Inspect representative frames and final output with `../beam-export/SKILL.md`. Preview may use direct sandboxed HTML for eligible full-canvas scenes; export and explicit frames always request completed deterministic frames.
