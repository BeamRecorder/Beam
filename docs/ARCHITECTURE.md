# Architecture Guidelines

DemoRecorder is an Electron application with a Vue renderer and a native Rust capture engine. The boundaries below are intentional and must remain explicit.

## Runtime layers

```text
Vue renderer
  -> typed window.capture API
Electron preload
  -> narrow IPC methods
Electron main process
  -> capture-engine JSON-lines protocol
Rust capture engine
  -> native screen, cursor, camera, audio, timing, and storage backends
Session files on disk
```

### Vue renderer

The renderer owns presentation, editor state, playback state, and user interaction. It must not access Node.js, arbitrary IPC, native APIs, or unrestricted filesystem paths.

Use feature folders under `src/components/` for feature composition. Put reusable controls under `src/components/ui/`. Keep domain types in `src/types/` or a feature type file such as `{feature}-types.ts`.

### Preload

The preload is the only renderer-facing bridge. Expose narrow, typed operations through `window.capture`. Never expose `ipcRenderer`, a generic `invoke(channel, payload)` function, filesystem access, or Node.js globals to the renderer.

### Electron main process

The main process owns windows, IPC handlers, project/session file access, and the capture-engine child process. Validate identifiers and paths at this boundary. Resolve project-relative paths safely and return structured data rather than leaking unrestricted filesystem access.

### Rust capture engine

Rust owns capture lifecycle, native permissions, source discovery, clocks, track coordination, encoding, cursor events, recovery, and manifest persistence. Platform-specific code belongs under the relevant backend module. Shared behavior belongs in platform-neutral modules.

## Session and project data flow

- A project contains a versioned `project.json` and references one or more session directories.
- A session contains a versioned manifest, one directory per track, segment metadata, timing/health data, and cursor event/shape data when supported.
- Track metadata is the source of truth for available media. Consumers must not infer a track from a filename alone when the manifest is available.
- Optional tracks may be absent or failed. The editor must preserve that distinction and present it explicitly.
- Session timestamps use the capture session timeline. Playback code must convert them consistently and must not invent keyframes or events.

## Feature boundaries

- UI components render state and emit user intent.
- Composables coordinate reactive behavior and browser media primitives.
- Typed API modules define renderer-facing contracts.
- Electron code adapts files and IPC into safe API responses.
- Rust code records and persists capture data.

Do not move native capture logic into Vue, add filesystem reads to components, or make a UI component parse an unrelated protocol format when the main process can provide a typed representation.

## File and module organization

- Keep source files below 500 lines. Split a large feature into a canvas/player, timeline, panels, composables, and type modules.
- Prefer one responsibility per module.
- Keep parsing and validation at the boundary where data enters a layer.
- Keep public interfaces small and documented when they cross process or package boundaries.
- Avoid circular dependencies between UI primitives, feature components, and domain adapters.

## Change review

Architecture changes must explain the affected boundary, the data contract, failure behavior, and the verification performed. Security boundary changes require focused review of preload exposure and path validation.
