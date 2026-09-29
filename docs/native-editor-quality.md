# Native recording quality and editor reference

## Recording evidence

The inspected recording is `screen.webm` under the studio project
`01a0e9c3-7d9e-71f5-9315-b8dc5501cdbc`, recording
`01a0e9c3-7dbe-7577-b3bd-671997ed78f5` in the user's existing Beam library.
Its manifest, measurements, packet times and a decoded image were inspected directly.
The original file was not changed.

- VP8, 1920 × 1080, YUV 4:2:0, BT.709, 239 frames, 666,034 bytes.
- File duration 10.926 seconds, measured average bitrate 487,649 bit/s.
- Manifest: 239 frames acquired, received and encoded; zero dropped frames.
- Median frame interval 31.5 ms, longest interval 1.035 seconds. Actual delivery
  averaged about 21.85 frames/s, despite a nominal 30 fps stream. The timestamps
  do not establish whether portal damage pacing or source scheduling caused the gaps.
- Recording had no `videoscale`. The dimensions were already correct.
- VP8 used realtime deadline 1 and `cpu-used=8` without a bitrate or quantizer
  configuration. Installed GStreamer defaults were 256 kbit/s VBR and a maximum
  quantizer of 63. Compression artifacts are visible in the decoded original,
  before the editor renders it. The old preview also capped the image at 960 × 540.

The recorder now selects an encoder profile that supports the unchanged source
size. Intel VA VP9 uses profile 1 / VUYA, retaining full chroma detail, with CQP 30,
balanced target usage and a two-second keyframe interval. QSV VP9 uses explicit
CQP quality; oneVPL's advertised 16-pixel caps are narrowed to the Intel VP9
128 × 96 minimum observed by the writer tests. The supported software VP8 profile
has an explicit resolution/cadence bitrate budget and bounded quantizers, with
encoder resizing and frame dropping disabled. A streaming failure remains an
error; Beam does not retry it with a different encoder. Manifests store the actual
codec. Pause/resume rejects a codec change rather than mixing codecs in one track.

### Before/after measurement

Both encoders received the same 60 native RGBA frames at 1920 × 1080 / 30 fps.
The input was a horizontally moving, unscaled crop of the supplied Concat screenshot.
The old encoder used its exact previous settings. The new encoder ran on the
local Intel Meteor Lake / Arc GPU. FFmpeg compared all 60 decoded frames with the
original RGB input, with frame-index-aligned timestamps and no frame duplication.

| Measurement | Previous VP8 | New VA VP9 |
| --- | ---: | ---: |
| Width × height | 1920 × 1080 | 1920 × 1080 |
| Frames | 60 | 60 |
| Chroma | 4:2:0 | 4:4:4 |
| RGB SSIM | 0.909847 | 0.989565 |
| WebM bytes | 168,819 | 429,426 |
| Measured bitrate | 675,276 bit/s | 1,717,704 bit/s |

Decoded before/after frames were also viewed. Text, thin borders and the photo
retain visibly more detail. This comparison proves the encoder change on a shared
source; the lost raw frames from the original recording cannot be reconstructed.
It does not measure portal pacing or a new end-to-end desktop capture.

The separate hardware `TrackWriter` test confirms actual production-pipeline VP9,
4:4:4, native 1920 × 1080 output, all 12 submitted frames, and the reported codec.
It creates no window. The reproducible input, WebMs, decoded PNGs, SSIM frame stats
and original analysis are kept in ignored `.cache/recording-quality/`.

## Concat reference and native UI

The reference checkout is ignored under `.cache/concat-reference/Concat`, pinned
to `8ee0d36a5bd1d6e2f6497ced7e85e84057821a95`. Both supplied screenshots were opened
and kept next to it. The workspace, pane, splitter, media pane, configuration pane,
preview pane, timeline pane, segmented control and theme Slint files were read.
Beam's implementation is Solid TSX rendered by Argui, without a Concat/Slint runtime.

The native workspace uses 31/47/22 column proportions and 60/40 top/timeline
proportions, 8 px gutters, 12 px pane radii, 52 px headers, neutral library tabs,
28 px segmented controls and form fields, while retaining Beam's shared orange
action and focus colors in both light and dark themes.
Bounds retain usable neighbouring panes when dragging or resizing the window.
The library/sidebar, preview/inspector, timeline/top and track-header dividers
support native pointer dragging and keyboard resizing. Track headers and clips
share their vertical scroll viewport; the timeline grid fills its pane.

Media cards use actual native decoded thumbnails. Source artwork is cached in
Rust as GPU canvas registrations; JS receives identities, never paths or pixels.
Only the visible library rows and timeline clips mount artwork requests. Thumbnails
are serialised and bounded to 256 px. Preview defaults to Full; Half and Quarter
change native GPU sampling without altering the originals, canvas or export size.

The six library tabs expose Beam's real operations. Text creates native GES titles;
Transitions apply bounded fades; Effects and Filters edit GPU composition controls;
Templates apply canvas presets. Titles, fades, trim/split and preset operations
are persisted in non-destructive projects and undo/redo history. Contextual video,
audio, effects and text controls share the same label/control rows. Existing
automatic zooms, theme changes and localisation are retained.

The content catalogue differs from Concat: Beam has its own title/effect/canvas
operations. Follow-up work added independent timeline sequences, visible video
filmstrips and native Blick waveforms. Concat's drag-pan tool and selection
handles over the preview remain outside this change. Pixel equality, platform
decorations and live pointer/focus behaviour require the user's visual test;
no GUI window was opened for validation.

## User test

Build the native bundles, then launch the editor yourself:

```sh
bun run --filter @beam/native-ui build
cargo run --manifest-path apps/beam-native/Cargo.toml -- --editor
```

The earlier `/tmp/beam-ges` extraction was temporary and may disappear between
launches. On Fedora, install `gst-editing-services-devel` matching the installed
runtime, or keep that package's development files under
`~/.cache/beam/ges-sdk/<installed-rpm-version>/usr`. `bun run beam:native`
detects the matching cached SDK when the system development package is absent.
For a direct Cargo invocation, point `PKG_CONFIG_PATH` to its `usr/lib64/pkgconfig`
directory and `LIBRARY_PATH` to its `usr/lib64` directory.

Test dragging all pane dividers, growing the timeline, selecting a clip, switching
video/audio/effects tabs, creating and editing a title, applying a fade, undo/redo,
and Full/Half/Quarter. Record a fresh screen clip to assess capture quality: Full
preview cannot restore detail discarded by the previous recording encoder.

## Validation completed without a window

- TypeScript checking and the native launcher/settings/editor builds passed.
- 53 focused Vitest cases passed across layout, library operations, timecodes,
  timeline calculations, native API and editor state. The reported V8 coverage
  for instrumented editor logic was 100% lines/statements/functions and 95.68%
  branches; this is not a UI pixel coverage measurement.
- 23 recording encoder tests and the separate Intel VA production-writer test passed.
- 18 distinct focused engine cases passed, covering titles/history/validation,
  image import, preview resolutions, seek/source timing, thumbnails and zooms.
- 17 focused session tests passed for screen preparation/failure, codec mismatch,
  pause/resume, independent tracks and segment publication, plus three public
  preparation tests. No real screen permission dialogue was opened.
- Five native boundary/cache cases and the QuickJS editor scene passed. The latter
  checks the six categories, native separator semantics, a full-height timeline
  grid, clip selection, and a fresh undo snapshot updating retained controls.
- Targeted Rust formatting and Clippy with warnings denied passed for the engine,
  encoder and session; native application Clippy also passed.
- `git diff --check` passed. All source files added/edited in the editor stay below
  500 lines. No commit or merge was made.

The editor scene regression now passes after the concurrent Argui runtime fix.
It checks orange Play/snapping icons and Concat panel colors across dark/light/dark
changes, responsive pane navigation at 720×480 and 1000×700, and independent
sequence selection from the compiled editor bundle. No GUI window was opened.

The global Rust test-layout script still reports seven missing test mirrors in
concurrent `beam-screen` desktop-appearance/portal-restore work, outside this
change. It reports no missing mirror for the editor/encoder additions. Full
workspace suites and the global 85% Rust coverage gate were not run, following the
repository's restriction on global validation for focused work. Windows/macOS
hardware, GPU pacing during a new desktop capture, and the live visual/pointer
comparison remain unverified.

## Source visuals and resize verification

The focused source-visual/layout/API/state Vitest run passes 35 cases, with
99.63% statements, 96.71% branches, and 100% functions/lines for its five changed
logic modules. Native offscreen checks render real Blick waveform shells, check
pending/invalid data and retained redraws, and exercise cache capacity, cancellation
and strict request payloads. Real GStreamer fixtures check sparse video seeks,
frequency envelopes, cancellation/failure and transport availability during
source extraction. The Rust frequency envelopes are checked against frozen output
from the repository's browser Blick analyzer. Shared tabs and their sequence
snapshots mount in QuickJS and pass the native wire contract.

The earlier JS resize path coalesced a 1000-event absolute-move burst while
preserving release, cancel, handler and generation boundaries. Split-pane dragging
now bypasses JS entirely, as checked below. Live pointer-to-present latency and
desktop frame pacing still require the user's visual test. The targeted
native/editor checks pass without a GUI. The global
Rust coverage gate remains outside this focused verification. Native all-target
Clippy also encounters duplicate modules and a chunking lint in concurrent region
tests; the editor library and its relevant test targets are checked separately.

Final verification includes 36 focused editor-engine cases and 19 native cases,
including the real GPU shader/DMA-BUF checks and compiled responsive/sequence
scene. The audio streaming regression checks bins crossing chunk boundaries and
coarser cache reuse with the source file removed. Retry refreshes only failed
source visuals; ready cached visuals keep their leases. Type checking and the
editor-only build pass. Targeted formatting and Clippy pass; the workspace-wide
format check currently reports an unrelated formatting change in concurrent
`beam-screen` X11 catalog work. The native test-layout scan also reports existing
non-editor issues; all editor-owned additions have mirrors.

## Native splitter correction

The splitter's former `container` used block layout, so flex alignment props did
not center its pill. A full-size native `row` now centers it inside the larger
hit target. The idle fill is transparent; native hover alone reveals Beam's
primary orange with a 120 ms color fade.

Pane dragging now belongs to the Rust engine. It starts from measured dimensions,
updates only retained target layout styles, and preserves the producer tree.
Application state receives the final commit on release. Percentage panel roots
and growing siblings respond during the native drag; cancellation restores the
actual cached layout style. No JS movement/hover handler drives these splitters.

The compiled QuickJS editor scene checks all five handles: measured centering,
transparent idle/leave paint, orange hover paint, 1,000 native movements per
handle with zero event deliveries during movement, unchanged producer revision,
native pane reflow and one commit on release. A real final callback updates the
authored library width. The delivery test verifies the final-size payload.
Both focused native cases pass. The 15 focused TypeScript layout/geometry cases
pass with 100% statements, branches, functions and lines for those two modules.
Type checking and the launcher/settings/editor native builds pass. These checks
create no window and do not measure live desktop pointer-to-present latency.

The 17 focused Argui resize/schema/layout cases pass, including interruption by
changed authored dimensions or handle configuration and invalid final coordinates.
Two focused event-metadata cases pass for the new commit event.
Targeted Clippy passes for the native application and Argui libraries/test targets.
The root Rust test-layout scan now reports zero issues; the separate native
application scan still reports pre-existing non-editor mirror/layout issues.

The reusable causes, native resize contract, hover composition and validation
criteria are recorded in the Argui common-pitfalls skill and its interactive
control performance reference.
