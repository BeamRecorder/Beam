# Architecture Guidelines

Beam is an Electron application with a Vue renderer and a native Rust capture engine. The boundaries below are intentional and must remain explicit.

## Runtime layers

```text
Vue renderer
  -> typed window.capture API
Electron preload
  -> narrow IPC methods
Electron main process
  -> capture-engine JSON-lines protocol
Rust capture engine
  -> native screen, cursor, audio, timing, and storage backends
Session files on disk
```

### Vue renderer

The renderer owns presentation, editor state, playback state, and user interaction. It must not access Node.js, arbitrary IPC, native APIs, or unrestricted filesystem paths.

Use feature folders under `src/components/` for feature composition. Put reusable controls under `src/components/ui/`. Keep domain types in `src/types/` or a feature type file such as `{feature}-types.ts`. Browser webcam capture is the deliberate exception to native capture: a renderer media coordinator owns `getUserMedia` and `MediaRecorder`, while the preload exposes only bounded, session-owned write operations.

### Preload

The preload is the only renderer-facing bridge. Expose narrow, typed operations through `window.capture`. Never expose `ipcRenderer`, a generic `invoke(channel, payload)` function, filesystem access, or Node.js globals to the renderer.

### Electron main process

The main process owns windows, IPC handlers, project/session file access, and the capture-engine child process. Validate identifiers and paths at this boundary. Resolve project-relative paths safely and return structured data rather than leaking unrestricted filesystem access.

### Rust capture engine

Rust owns capture lifecycle, native permissions, source discovery, clocks, track coordination, encoding, cursor events, recovery, and manifest persistence. Platform-specific code belongs under the relevant backend module. Shared behavior belongs in platform-neutral modules.

## Startup work

- On Linux, warm native capabilities when Electron is ready, concurrently with renderer loading. Rust owns and caches FFmpeg capability probes; failures are reused for two seconds to avoid repeating a failed warmup immediately, then retried. The HUD still requests a fresh source catalog; warmup failure cannot prevent the UI from loading. Do not extend this warmup to platforms whose discovery can present permission dialogs.
- Linux FFmpeg inventories run concurrently, while hardware encoder trials remain sequential. A complete PCI/DRM vendor inventory skips vendor-specific backends that cannot run on the machine; missing or ambiguous hardware information retains all candidates. Positive NVIDIA device/container hints preserve NVENC even if PCI sysfs is filtered. Drain subprocess output before waiting for exit.
- Browser camera and microphone lists share an in-flight enumeration, without caching stale devices or opening temporary streams for labels. Restore available browser devices independently of native discovery. The camera overlay owns its preview stream and access errors.
- Ordinary preference updates preserve registered global shortcuts. Re-register only when the persisted shortcut map changes, including reset; serialize actual shortcut changes.

## Session and project data flow

- A project contains a versioned `project.json` and references one or more session directories.
- A session contains a versioned manifest, one directory per track, segment metadata, timing/health data, and cursor event/shape data when supported.
- Track metadata is the source of truth for available media. Consumers must not infer a track from a filename alone when the manifest is available.
- Optional tracks may be absent or failed. The editor must preserve that distinction and present it explicitly.
- Session timestamps use the capture session timeline. Playback code must convert them consistently and must not invent keyframes or events.

## Capture modes and project categories

- Persist the selected `studio`, `screenshot` or `instant` mode in `preferences.extras.captureMode`; missing preferences select Studio.
- `projects/project-library.cjs` combines all capture modes into one dated catalogue. Project summaries carry their mode; screenshot rename, delete and reveal requests pass that mode explicitly while storage formats remain separate. All views reuse `components/projects/ProjectPicker.vue`.
- Store video projects in `user/projects/studio/` or `user/projects/instant/`, and screenshot documents in `user/projects/screenshot/<uuid>/`.
- Before exposing project stores at startup, `storage/project-categories.cjs` moves legacy immediate project folders into Studio with filesystem renames. A journal resumes interrupted migration, directory collisions preserve both projects, and JSON media references are rewritten without copying video data. Invalid journals fail with a visible startup error.
- Quick Snip offers Studio (styled video) and Screenshot as direct capture choices. All Quick Snip video jobs export with the selected preset into Instant storage; disabling automatic zoom preserves the other effects. Device menus use a bounded Crop Bar-owned IPC with native Electron radio items and the existing Chromium device identifiers.
- Native source-selection cancellation crosses screenshot capture and default recording preparation IPC as `null`, identified by the engine error code before Electron serializes errors. Recording startup still cleans up prepared browser devices; only a clean cancellation returns Quick Snip to its existing selecting job. Permission denials, other capture errors and cleanup failures remain failures.
- Studio and Instant share `editor-presets.json`. Screenshot uses `screenshot-presets.json`. Existing editor preferences seed the video Default; only a new installation receives the bundled image/30% blur/strong shadow/click spring defaults.
- `packages/capture/src/screenshot/` owns native still capture: WGC on Windows, ScreenCaptureKit on macOS, and the existing Portal/PipeWire sample consumer on Linux. It returns dimensions after atomically writing a PNG; Electron exposes only UUID-scoped media URLs and validates saved image state.
- Screenshot export reports captured, rendered and completed stages for the current Quick Snip job. The main process owns UUID validation, source media URLs and bounded preview validation; cancellation invalidates pending renderer work before it can publish to the clipboard. Source PNG encoding is lossless and prioritizes latency, including optimized PNG dependencies in development builds.
- The screenshot editor reuses the Studio canvas, appearance and shape rendering functions and property controls. Its persistence and editor orchestration live under `video-editor/screenshot/`; it has no timeline or audio state. PNG/WebP output preserves alpha when the background is disabled.
- `video-editor/elements/` owns the shared Elements palette, text editing and freehand interaction. Studio adapts insertion and edits through the composition engine; Screenshot stores the same `ShapeClip` records in its ordered `shapes` array. Text and drawing are generated shape families, with optional text content/style and bounded normalized stroke points. Existing shapes remain readable without these fields. Electron validates the added content before saving.
- Screenshot composition stores a back-to-front list of layer IDs with group opacity, blend mode and a lock flag. It includes the background, captured image, all elements, independent static cursors and watermark. Older documents without this list retain their original paint order; Electron rejects duplicate, missing or unknown layer references. The canvas hit-test and floating Composition panel use this same list.
- Static screenshot cursors reference a persistent pack and fixed cursor ID. Their position is the image's top-left corner; rotation is around its center. Screenshot and Studio reuse `CursorAppearanceControls`, asset decoding, tinting, size limits and shadows. Decode cursor artwork at the largest editable size so position/size changes do not fetch it again; wait for assets before export.
- Layer opacity and blend mode apply after flattening the layer into a reusable scratch surface. Normal opaque layers render directly. Shapes with backdrop blur sample the already composed canvas, including when their own drawing is isolated; internal masking operations must not replace the layer's selected blend mode. Screenshot preview and PNG/WebP export use the same compositor.
- Composition thumbnails reuse the layer renderer in a dedicated Worker with a CPU-oriented readback canvas, tight alpha bounds and aspect-preserving PNG output. The Worker caches decoded raster assets; SVG cursors reuse the editor's decoder and transfer a cloned bitmap. Thumbnail identity follows layer IDs and visual revisions, independently of selection, visibility and order. Debounce changes, discard stale responses, close transferred bitmaps and revoke replaced image URLs; a failed preview remains visibly unavailable. Thumbnails show isolated layer content, before composition opacity and blending.
- Studio and Screenshot use the same generic snapshot history engine, capped at 50 states including the current state. Screenshot saves its versioned undo and redo stacks alongside the current state in `screenshot.json`, atomically through the existing save queue. Electron validates every snapshot and the combined depth; unreadable optional history falls back to the current state without hiding the project. Canvas gestures use the shared property-interaction transaction so a drag or crop forms one undo step; preview URLs, assets, selection and preset-library administration stay outside edit history. Studio's existing history remains in memory.
- Element text adapts to the existing caption layout, inline editor and typography renderer. A text edit remains a local draft until blur or Ctrl/Cmd+Enter; Escape discards it. Imported fonts must finish loading before preview/export in the renderer and before video export in its Worker. Keep element text and captions on the same decoration implementation.
- Freehand input commits one editable element on pointer release; pointer cancellation or Escape discards the current gesture. Coalesced samples and bounded resampling retain a long gesture's endpoints. Smoothing is stored with the points so users can adjust it later. The drawing and text overlays use the same camera projection/inverse projection as Studio, including perspective; preview and export share the generated-layer renderer.

## Feature boundaries

- UI components render state and emit user intent.
- Composables coordinate reactive behavior and browser media primitives.
- Typed API modules define renderer-facing contracts.
- Electron code adapts files and IPC into safe API responses.
- Rust code records and persists native screen/cursor data; Electron persists browser-produced camera, microphone, and system-audio sidecars after native session finalization.

Do not move native capture logic into Vue, add filesystem reads to components, or make a UI component parse an unrelated protocol format when the main process can provide a typed representation.

## File and module organization

- Keep source files below 500 lines. Split a large feature into a canvas/player, timeline, panels, composables, and type modules.
- Prefer one responsibility per module.
- Keep parsing and validation at the boundary where data enters a layer.
- Keep public interfaces small and documented when they cross process or package boundaries.
- Avoid circular dependencies between UI primitives, feature components, and domain adapters.

## Change review

Architecture changes must explain the affected boundary, the data contract, failure behavior, and the verification performed. Security boundary changes require focused review of preload exposure and path validation.
