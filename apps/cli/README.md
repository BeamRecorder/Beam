# Beam CLI

Run the development CLI from the repository with Bun. `inspect`, `edit` and
`benchmark` use the reusable engine without opening Electron or mounting Vue.

```sh
bun run beam commands
bun run beam inspect /path/to/project.json
bun run beam edit /path/to/project.json commands.json edited-project.json
bun run beam benchmark edited-project.json 10000
bun run beam browser install
bun run beam export render-request.json output.webm
```

Successful commands write one JSON result to stdout. Errors write JSON to stderr
and exit with status 1. Existing output files are preserved; pass `--overwrite`
explicitly to replace them.

Editing accepts a Beam project, standalone composition, render snapshot or export
request. Other project metadata is preserved. For example, `commands.json` can
contain this transaction, committed as one revision and one undo step:

```json
[
  { "type": "clip.move", "payload": { "clipId": "clip-id", "startMs": 1000 } },
  { "type": "clip.enable", "payload": { "clipId": "clip-id", "enabled": false } }
]
```

`commands` lists built-in command names. Engine consumers can register additional
typed handlers with `createCommandRegistry` or `createCompositionCommands`.
Handlers validate payloads and return immutable documents. Unrecognized commands
and edits affecting locked content fail before the output is written.

The document benchmark measures index construction, timeline scene queries and up to 200 immutable editing transactions.
Its bounded metrics include median and p95 timings; it does not measure media
decoding or GPU rendering.

Export accepts the `ExportRequest` contract in
[`packages/encoder/src/export-types.ts`](../../packages/encoder/src/export-types.ts),
including its complete `CompositionSnapshot`. A saved desktop project alone is
not a portable render request. Media, background and cursor URLs can use paths
relative to the request, file URLs, HTTP URLs or embedded data URLs. Desktop
`project-media:` URLs and transient blob URLs require host hydration first.
Imported fonts must supply `snapshot.fontSources`, mapping each font asset ID to a portable URL or path; missing mappings fail before opening Chromium.

Export compiles a dedicated bundle and launches independent headless Chromium using the same encoder worker and completed-frame renderer as desktop. Linux works with DISPLAY and WAYLAND_DISPLAY unset. Software WebGL is the explicit default. Set `BEAM_CHROMIUM_GPU=hardware` to select a configured hardware backend, `BEAM_CHROMIUM_EXECUTABLE` to use your own Chromium, or `BEAM_CHROMIUM_CACHE` to relocate the installed backend. No renderer downgrade or sandbox disabling is applied. Output chunks are
acknowledged after positioned disk writes and published after mux finalization.
Completion, errors and interruption release the backend and owned temporary file.

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for package boundaries,
backend interfaces and the versioned scene/keyframe contracts.

Scene and animation commands accept their typed payload directly. For example, this track animates a clip's horizontal position in its local scene clock:

```json
[
  {
    "type": "animation.set",
    "payload": {
      "id": "slide",
      "targetId": "clip-id",
      "property": "transform.x",
      "interpolation": "number",
      "timeSpace": "local",
      "keyframes": [
        { "timeMs": 0, "value": 0 },
        { "timeMs": 1000, "value": 0.25, "easing": "ease-out" }
      ]
    }
  }
]
```

The easing on a keyframe describes the outgoing segment. Scene groups use `scene.set` with `version`, `roots` and `groups`; see the complete types in [`scene-types.ts`](../../packages/engine/src/scene/scene-types.ts). Existing flat documents need no rewrite.

Run completed-frame integration checks with:

```sh
BEAM_HEADLESS_TEST=1 bunx vitest run apps/cli/src/headless-render.integration.test.ts
```
