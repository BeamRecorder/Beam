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

Linux interaction capture uses the privileged input helper under both Wayland and X11. Compare the bundled and installed helper bytes in bounded chunks and verify the installed Polkit policy before reusing it; crate version strings are not binary identity. AppImage installation/update keeps the sealed executable alive across authorization. Drain helper stderr concurrently, retain at most 4 KiB for diagnostics, and return failed access with its error code/message; pkexec exit 127 does not distinguish an authorization failure from an execution failure. Dismissing authorization (exit 126) returns to the requestable state without a failure. Preserve startup errors until retry or successful access, expose them in the HUD/preferences/onboarding and copied system information, and never mark failed capture as authorized. DEB depends on `pkexec`; RPM depends on `polkit`.

## Startup work

- The editor keeps its document transparent over the native themed backing until the shared theme store finishes hydration. Make the renderer opaque before mounting; do not perform a second bootstrap preference request.
- Load the selected editor module on demand. Video module loading and its project/data requests run concurrently; `projects:get` resolves only the selected video project summary without reading the screenshot catalogue. The project picker and ambient video decoder load only when needed.
- Screenshot transfers ownership of validated IPC history snapshots to the shared history engine and retains only document metadata alongside its editable state. Default history initialization still copies caller-owned snapshots; every restored state is cloned before editing.
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

## Preview resource ownership

- Rebuild the scene and playback interval indexes when composition timing changes. Queries preserve half-open clip intervals, floating-point cut snapping, every overlapping layer and the existing paint order. The playback ID/predecessor maps change with the same composition; a rejected retime must leave the current timeline usable.
- Playback owns one reusable canvas per clip sink and converts it into an owned bitmap before requesting another frame. Keep decoded surfaces only for active clips and the 120 ms lookahead; after iterator cleanup, replace inactive sinks to release their old canvas pools. The renderer's frame-cache budget and preview resolution are independent of these pools.
- Timeline audio waveforms decode only buffered viewport source ranges with the bundled Mediabunny in three workers. Sequential samples feed channel extrema and four frequency envelopes; completed bins stream as transferable arrays, with explicit pending regions and generation cancellation. Cache 32 compact slices, never whole-file PCM. Reuse equal/finer source bins across zoom, pan, trim and clip placement changes; pool peaks for lower detail and decode only missing or insufficiently detailed intervals. Preserve completed bins when cancelling an extraction. Keep the last overlapping source slice visible during viewport refinement; commit its replacement bitmap, source placement and pending regions together after rendering, so zoom never clears already displayed audio. Crossfade ready refinements over 160 ms using two bitmap layers and compositor opacity, respecting reduced motion; coalesce updates during the blend and release the outgoing bitmap afterward. Blick mountains share one WebGL2 renderer across clip canvases, calculate their envelope once per column, draw only on data/size changes, and release GPU resources with the last subscriber; the live voiceover meter remains independent.
- Timeline thumbnails share two workers and a source-time cache per asset ID/URL within an editor's media-processing collector. Coalesce the union of visible requests, reuse pending frames, and retain every subscriber's visible times. Empty aggregate viewports stop workers while keeping cached URLs; the final subscriber releases the cache too. Late responses must not revive a disposed source, and changing one clip's source must not clear another clip's cache.
- Detach iterator/queue ownership before asynchronous cleanup. Configuration changes validate first and check their version after cleanup, then commit the consumer map and interval index together. Disposal invalidates pending window preparation so it cannot recreate released sinks.

## Idle editor and export ownership

- The export popover receives cheap project metadata and a snapshot factory. Materialize an immutable export request only when the user starts an export; property edits must not rebuild cursor telemetry for the popover.
- The preview performance monitor runs while playback, media work, export or user interaction is active. An idle or hidden editor owns no monitoring animation frame or sample interval. Resume with fresh timing baselines; a flat performance graph does not animate identical samples.
- Timeline row reordering uses `ui/transitions/ReorderGroup.vue`. Measure row positions only when their IDs change order or membership, preserving move animations and reduced-motion preferences without layout reads on appearance edits.
- Cursor artwork uses a 32-entry, 16 MiB decoded-pixel LRU. PNG cache keys ignore display size and tint, since these do not alter PNG decoding. Eviction drops the cache reference without changing images still owned by a consumer; uncached export loading remains independent.
- Screenshot composition workers retain at most three image rasters with a 512 px longest edge. Intrinsic dimensions continue to determine framing; source crop coordinates are converted to bitmap pixels. Main previews and exports retain full-resolution sources. Collapsing Composition terminates its worker while retaining ready thumbnail URLs; reopening reconciles edits and regenerates unfinished thumbnails.
- Screenshot encoding releases its offscreen render canvas and its owned compositing scratch canvas immediately after blob encoding, including failures. Native image validation, clipboard publication and the atomic temporary-file write remain unchanged.

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
- `video-editor/elements/` owns the shared Elements palette, text editing and freehand interaction. Studio's Add → Elements menu uses the same insertion tools as Screenshot, including editable text and freehand drawing. Element selections open the Elements properties page while retaining timeline transitions, visibility and selection deletion. Studio adapts insertion and edits through the composition engine; Screenshot stores the same `ShapeClip` records in its ordered `shapes` array. Text and drawing are generated shape families, with optional text content/style and bounded normalized stroke points. Existing shapes remain readable without these fields. Electron validates the added content before saving.
- Screenshot composition stores a back-to-front list of layer IDs with group opacity, blend mode and a lock flag. It includes the background, captured image, all elements, independent static cursors and watermark. Older documents without this list retain their original paint order; Electron rejects duplicate, missing or unknown layer references. The canvas hit-test and floating Composition panel use this same list.
- The floating Composition header toggles the panel and drags within the screenshot canvas workspace. Preview movement uses animation-frame-coalesced `translate3d`; only pointer release saves normalized header coordinates in `preferences.extras.screenshotCompositionPosition`. Reuse the preference snapshot already loaded by the theme bootstrap. Position is user UI state, outside screenshot documents and undo history. Choose the opening direction from the available space at each opening, then lock it until the panel closes. Dragging an open panel preserves its height and bounds its entire rectangle within the canvas. A collapsed header can reach the canvas edges; only its chevron adapts to the next opening direction. Content changes scroll within the current side instead of flipping the open panel. The header stays anchored when toggling, and the chevron rotates with reduced-motion support. Cancelled gestures restore the committed position.
- Composition content is capped at 360 px and scrolls its layer list. Layer deletion lives in the shared context menu opened from the target row, including keyboard invocation; recheck that row's lock/removability and the editor's disabled state before deletion. Keep the 56 px header outside the scrolling content and pass its geometry to the shared Button's inner native control explicitly.
- Screenshot selection is shared between Composition and canvas hit-testing: Ctrl/Cmd-click toggles membership, a plain click replaces it, and the last selected member owns the properties and resize handles. Keep selection outside documents and history and prune missing IDs after deletion or history restoration. Group translation previews immutable records once per animation frame, caches the backdrop below the lowest moving layer, and commits coordinates in place on release without reloading assets. Preserve member spacing at canvas bounds, leave hidden/locked layers fixed, and delete only removable unlocked members in one undo step. A context menu on an existing member keeps the group; opening it on another row replaces the selection.
- Static screenshot cursors reference a persistent pack and fixed cursor ID. Their position is the image's top-left corner; rotation is around its center. Screenshot and Studio reuse `CursorAppearanceControls`, asset decoding, tinting, size limits and shadows. Decode cursor artwork at the largest editable size so position/size changes do not fetch it again; wait for assets before export.
- Layer opacity and blend mode apply after flattening the layer into a reusable scratch surface. Normal opaque layers render directly. Shapes with backdrop blur sample the already composed canvas, including when their own drawing is isolated; internal masking operations must not replace the layer's selected blend mode. Screenshot preview and PNG/WebP export use the same compositor.
- Composition thumbnails reuse the layer renderer in a dedicated Worker with a CPU-oriented readback canvas, tight alpha bounds and aspect-preserving PNG output. The Worker caches decoded raster assets; SVG cursors reuse the editor's decoder and transfer a cloned bitmap. Thumbnail identity follows layer IDs and visual revisions, independently of selection, visibility and order. Debounce changes, discard stale responses, close transferred bitmaps and revoke replaced image URLs; a failed preview remains visibly unavailable. Thumbnails show isolated layer content, before composition opacity and blending.
- Studio and Screenshot use the same generic snapshot history engine, capped at 50 states including the current state. Screenshot saves its versioned undo and redo stacks alongside the current state in `screenshot.json`, atomically through the existing save queue. Electron validates every snapshot and the combined depth; unreadable optional history falls back to the current state without hiding the project. Canvas gestures use the shared property-interaction transaction so a drag or crop forms one undo step; preview URLs, assets, selection and preset-library administration stay outside edit history. Studio's existing history remains in memory.
- The video editor exports a versioned transcript JSON from enabled text captions, including manual text, segment/word timestamps in absolute timeline milliseconds, and caption IDs. Build the payload only when exporting; omit keyboard captions and clip content outside the timeline interval. Edited custom text replaces the original sentence text and has no fabricated word alignment. The narrow `captions:export-transcript` IPC validates a bounded schema, opens an owned JSON save dialog, and atomically writes the selected file; it exposes no import or renderer-supplied filesystem destination.
- Timeline element thumbnails reuse the shared shape/text/freehand renderer in bounded 320 × 96 bitmaps, await imported fonts, and refresh only when artwork or source dimensions change; timeline zoom, timing and placement reuse the current preview. Element text adapts to the existing caption layout, inline editor and typography renderer. A text edit remains a local draft until blur or Ctrl/Cmd+Enter; Escape discards it. Imported fonts must finish loading before preview/export in the renderer and before video export in its Worker. Keep element text and captions on the same decoration implementation.
- Freehand input commits one editable element on pointer release; pointer cancellation or Escape discards the current gesture. Coalesced samples and bounded resampling retain a long gesture's endpoints. Smoothing is stored with the points so users can adjust it later. The drawing and text overlays use the same camera projection/inverse projection as Studio, including perspective; preview and export share the generated-layer renderer.
- Highlight is an inverse mask in the existing effect clip model (`kind: blur`, `mode: highlight`); strength controls the outside opacity, while tintOpacity and optional highlightColor control the illuminated interior independently. New highlights use white at 20%; existing clips with zero tint retain their appearance. It shares effect geometry, color and feather controls, and Studio's timing and transitions. Screenshot offers both Highlight and Blur in Elements, stores them in optional `effects`, and includes them in the same composition, history, hit-testing and thumbnail paths. Preview and export share the mask renderer. Hard edges render without a scratch surface; feathering owns one reusable surface, released with its renderer. Highlight and Blur keep separate saved defaults.

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
