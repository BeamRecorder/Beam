# Experimental zoom

The project-level **Experimental zoom** switch in the Zoom inspector selects the
pinned Recordly 2D camera. It is off by default. Existing telemetry works; a new
recording is unnecessary. Switching explicitly regenerates replaceable automatic
2D zooms. Locked, detached, manual and other-session zooms remain owned by the
user. The switch and regeneration form one undoable edit.

**Zoom background** is a separate project setting, available in both modes.
Legacy projects keep their moving background; the experimental default is fixed.
An explicit On/Off choice survives mode changes, saves, undo and export. Orbit
keeps its existing camera-independent backdrop.

## Pinned source and licence

Reference: [Recordly at 0ea5bd753050874a6d157cab818489aa398d6161](https://github.com/webadderallorg/Recordly/tree/0ea5bd753050874a6d157cab818489aa398d6161).
The source declares **AGPL-3.0**, not MIT. See
[third-party notices](../THIRD_PARTY_NOTICES.md) and the complete licence shipped
under `packages/engine/src/zoom/recordly/LICENSE.md`. The experimental switch is
not a licensing boundary: the camera code is included in the combined build.

`packages/engine/src/zoom/recordly/upstream.json` records the original/local
SHA-256 for each copied file. Executable algorithm statements are retained.
Changes are limited to renderer **type-only** import targets/import ordering and
extracting the transitive declarations from the original `types.ts`. The renderer
bridge holds actual scale, position and filter controls, without importing Pixi
into the engine. This replaces the earlier handwritten imitation; the duplicate
camera, follow, transition and action-ranking implementations were removed.

The runtime uses the published MIT `pixi-filters@6.1.5` directional/radial fragment
kernels. Its GL host follows Pixi's ES100 defines, 13-sample radial kernel,
premultiplied alpha, transparent margins and power-of-two texture allocation.
Both filter passes run in their original order, including an inactive first pass.
Only the video/frame content enters the filters. Shadow follows the camera outside
the filter, with cursor/annotations as separate layers. GPU surfaces are reused,
limited to 64 MiB per pooled RGBA texture and the device texture limit, and disposed; allocation/context failures are explicit errors.

## Algorithm inventory

Paths below are relative to the vendored `recordly/` directory.

| Source | Experimental execution |
| --- | --- |
| `timeline/zoomSuggestionUtils.ts`, `cursorInteractionCandidates.ts`, `videoPlayback/cursorPress.ts` | Actual upstream normalization, per-button press/release pairing, explicit-click candidates and weights, 2500 ms temporal clustering, best-click anchor, padding, spacing, free-slot placement and independent source-interval projection. No Beam spatial split, lookahead or shot scoring is inserted. |
| `types.ts` clip functions | Source trims/speeds, chronological clip sorting, rounded timeline/source timestamps and nearest-boundary mapping across gaps. Beam asset session offsets and IDs are adapted before these functions run. |
| `cursorMotionPresets.ts` | Focused and Cinematic (`smooth` persisted identity). The Zoom preset action changes entry/exit controls and disables Classic, exactly like Recordly ZoomSettings; it does not change cursor artwork/settings. Exact duration tuples drive Cinematic camera spring weighting. |
| `videoPlayback/mathUtils.ts`, `motionSmoothing.ts`, `zoomTransition.ts` | Original Bézier inversion, closed-form spring regimes, moving-goal guard, rest thresholds, 240 Hz finite profiles and profile cache. |
| `videoPlayback/zoomRegionUtils.ts` | Original isolated envelopes, overlap/dominance rules, variable-depth connected chains, configurable positive-gap connections and pan duration. |
| `videoPlayback/cursorPosition.ts`, `cursorViewport.ts`, `focusUtils.ts` | Original cursor interpolation, explicit source/viewport focus spaces and crop projection, including the 1e-6 crop-edge tolerance. |
| `videoPlayback/cursorFollowCamera.ts`, `sceneMotion.ts` | Original quiet-zone acquisition, independent axes, zoom-out freezing, source/crop resets, outgoing/incoming follow states and connected handoff. Follow cursor Off remains an explicit Beam override. |
| `videoPlayback/cameraTransform.ts`, `zoomTransform.ts` | Original frame-driven focus/depth springs, complete subdivision of delayed media intervals, bounds and scale/translation matrix. Beam stores the equivalent inverse camera center. |
| `videoPlayback/sceneMotion.ts`, `frameMotionSample.ts` | Original spring/snap/preserve transport decisions. Repeated timestamps preserve the composed pose/blur; ordinary pauses preserve the displayed pose. A presented seek uses a fresh follow target and snap, then resets follow on resume. A seek waiting for pixels does not compose against the old image. |
| `videoPlayback/cameraMotionBlur.ts`, `zoomTransform.ts` | Original motion classification, pan/radial choice and all tuning values, including repeated-frame and discontinuity behavior. Blur metadata survives the first return-to-identity frame. |
| `videoPlayback/cursorLoopTelemetry.ts` | Original cursor-path loop support for supplied effective camera telemetry, using retained source coordinates. It is not exposed as a Beam cursor-artwork control. |

Advanced controls expose Classic, connection gap/pan time, entry/exit duration,
explicit-generator duration, camera smoothness/stiffness/damping/mass and spatial
blur amount/tuning. Choosing either preset preserves unrelated settings.
Only parameters used by the pinned algorithm are exposed as controls; unused
legacy blur response/safe-zone fields remain preserved in storage. Controls,
descriptions and generator statuses are translated in all 15 languages.

## Beam integration

- **Fresh recording:** automatic application waits for matching source telemetry
  (at least two samples), and applies only to an unsaved, unedited full-source
  clip at speed 1 with no authored zoom. Its initial preferred duration is 2000 ms,
  as upstream. The source is latched through undo/autosaves, including when edited
  while data loads. An absent clip is still hydration, not a completed check.
- **Explicit Generate:** accepts explicit recorded clicks, adds suggestions in free
  slots and reports no telemetry/no interactions/no slots. It uses the configured
  preferred duration. A mode switch is a separate, explicit regeneration action.
- **Presentation clocks:** experimental preview uses the reference Pixi 60 fps cap,
  retaining its fractional cadence remainder on high-refresh displays. It composes
  once for each supplied media timestamp;
  export keeps its own state and advances on actual output timestamps, with the
  original first-frame 1/60 s interval and no invented mid-export preroll. Paused
  seek samples intentionally differ from a continuously played camera, as in
  Recordly. Query/thumbnail sampling has a separate replay state and cannot alter
  preview or export. Settings/document edits retain live spring momentum while
  source replacement discards it.
- **Geometry:** camera inputs use Beam's real crop and media mask, including phone
  insets, active asset dimensions and composition layout. Beam does not overwrite
  document framing/padding with Recordly's zero-padding document default. Numeric
  parity comparisons use equal crops, masks, timestamps and settings.
- **Authored content:** Beam IDs, recording links, locks, cut provenance, 3D/Orbit,
  lenses, transitions, grouping and composition remain Beam features. This is a
  2D zoom port, not an importer or replacement for Recordly's complete editor.
  Beam's cursor rendering/settings remain independent; the camera uses the raw
  normalized position telemetry, as Recordly does. Cursor visibility never
  removes camera telemetry. Overlapping screens use the foreground screen source clock; Hold segments
  retain a constant source time and do not generate phantom clicks.
  Source/viewport metadata survives storage, and a switch to Beam manual handles converts it to canvas coordinates.

## Verification and limits

- `experimental/tests/fixtures/reference.json`: 23 generator cases and 27 camera
  traces from the pinned source, including clicks/releases/drags, gaps/blockers,
  trim/speed/cuts/duplicates/reordering, varying depths, crop/manual focus and
  8/30/60/144 fps. Numeric oracle outputs are unchanged. Legacy fixture manual
  focuses already converted to Beam canvas coordinates are marked as legacy at
  the adapter test boundary rather than falsely treating them as viewport input.
- `recordly-upstream.test.ts` and `recordly-camera-adapter.test.ts`: direct core
  checks plus independently orchestrated upstream camera/filter parameters,
  actual irregular frame intervals, seeks/pause/resume, crop epsilon, explicit
  focus spaces, loops, Classic and configurable connection settings.
- Focused settings, UI, persistence, history, fresh-source lifecycle and playback
  seek tests cover the Beam integration. Import and package-boundary checks remain
  enabled. A local domain variable called `window` does not become a browser API.
- `node scripts/diagnostics/recordly-render.cjs`: eight real WebGL2 checks on tiny
  images for alpha/orientation, both pan directions, radial blur, texture reuse,
  shadow separation, fixed/moving background and prepared preview/export pixels.
  Requires Bun, `puppeteer-core` and Chrome (`CHROME_PATH` overrides discovery).
- A separate comparison executed against the published Pixi 8.14.0 / Filters 6.1.5
  found exact identity pixels and at most 2/255 per-channel differences for the
  tested directional/radial images, after Canvas/WebGL alpha conversion. This is
  evidence for those inputs, not a claim of pixel identity on every GPU.

Native capture is unchanged. Native macOS/Windows rendering and long recording
visual review still require those machines and recordings. The tests do not
assert universal application, native-input or GPU-driver parity.
