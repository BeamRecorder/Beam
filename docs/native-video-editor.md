# Native video editor V1

Beam's native editor uses ARGUI's Rust renderer with the existing Solid/QuickJS adapter. Its layout follows Concat: source library, composed preview, contextual properties and timeline. Capture and NLE domains remain separate Rust crates.

The proposed next-stage architecture and sequenced build gates are in [the non-destructive, programmable editor plan](native-editor-plan.md). That document covers generic effects, editable zoom regions, transitions, incremental rendering, migration, and SDK/CLI/MCP access; it describes planned work rather than shipped V1 behavior.

## Run

Install GStreamer **1.24 or newer** (validated with 1.28.7), GStreamer Editing Services (GES), the OpenGL plugin, their development packages for a source build, and the plugins for the files/codecs you use. GES is a required dependency, in addition to core GStreamer. Fedora uses `gst-editing-services` and `gst-editing-services-devel`; Debian/Ubuntu use `libges-1.0-0` and `libges-1.0-dev`. GPU drivers and installed GStreamer plugins determine supported imports and hardware encoders. MP4 prefers hardware H.264 and offers AV1 when H.264 is unavailable; WebM prefers hardware VP9, then AV1 or VP8. AAC/Vorbis audio is added only when the timeline contains audio. The export menu shows the chosen codec and GPU encoder availability; it reports a missing hardware encoder instead of silently encoding video on the CPU. On Debian/Ubuntu also install gstreamer1.0-gl. Missing plugins produce a visible error.

```sh
git submodule update --init vendor/argui
bun install --frozen-lockfile
bun run --filter @beam/native-ui build
cargo run --manifest-path apps/beam-native/Cargo.toml -- --editor
```

The native crate and editor bindings require Rust 1.92 or newer. Use the launcher's video-editor button for standalone editing. Completed video recordings open with `--editor=<recording UUID>`, within the existing Beam project library. For development, `--editor-project=/absolute/project/directory` opens a specific native document. `BEAM_USER_DIR` selects an isolated preference/project library for tests.

## Editing and recovery

Import video and audio with the native file dialog. Select a clip for framing, opacity, brightness, saturation, volume and Beam automatic zoom. Drag its body to move it; selected edge handles trim it. The playhead determines the split point. Add video/audio lanes to compose overlays and mix audio; overlapping clips belong on different lanes. Visibility and mute controls belong to each lane. Original media stays untouched.

Every accepted edit saves `editor.beam.json`, including up to 50 states of undo/redo history. Imported sources remain in the library when their insertion is undone. Source-time ranges and camera control points survive cuts and moves. Recording imports use completed segments and real cursor sidecars, exposing optional-track failures without fabricated media. A corrupt primary document can open its last valid `editor.beam.previous.json` checkpoint and displays a recovery notice. Missing sources remain visible in the document; restore them and use Retry to rebuild the composition. A second editor cannot write the same project concurrently.

GES handles layers, timing and audio mixing. Beam compiles click clustering, easing, springs and cursor follow into seek-safe source-time controls for GStreamer's OpenGL camera effect. GPU composition, framing, color and preview scaling use GStreamer's GL elements; encodebin pins an available hardware video encoder. Original source dimensions and full export canvas dimensions are preserved. Export snapshots the current composition, reports progress, supports cancellation and publishes only a completed file under a new filename.

Preview draws through an Argui GPU canvas on the renderer's existing WGPU device. Raster bytes and native handles never cross QuickJS/JSON. A latest-frame mailbox wakes the canvas only when a frame changes. Argui provides one external-frame API, with Vulkan DMA-BUF on Linux, Direct3D 12 shared texture handles on Windows and retained IOSurface/Metal textures on macOS/iOS. The producer must complete its write fence and prevent buffer reuse; Argui retains sampled allocations until its actual GPU submission completes. Backend requirements remain optional, negotiated when the device is ready.

Beam's direct preview transport is currently connected and tested on Linux: GStreamer exports RGBA GL textures as DMA-BUF and Argui samples those allocations without mapping or uploading video bytes. GES's CPU source conversion/scale/flip helpers are replaced by GStreamer GL filters while timing and placement metadata stay with GES. VA decoders import their hardware surfaces directly into GL instead of mapping them on the CPU. Original decoder ranks remain untouched; editor-local adapter factories have higher ranks. Timelines/discovery share a persistent GL display so dropping an old timeline cannot invalidate another pipeline. GES composition metadata is applied to GL mixer pads because the 1.28 GL aggregator omits the samples-selected callback needed by GES.

Linux VA export converts the composited image to NV12 on the GPU, shares its two linear GL planes as DMA-BUF using GStreamer's EGL helpers, and passes them to the pinned hardware encoder with their actual strides/offsets and a producer lease. NV12 avoids the local VP9 driver's unsupported advertised ARGB mode. GES/encodebin still handles muxing and audio. Argui's Windows and Apple native imports compile for those targets; Beam's GStreamer producer adapters on those platforms still use the bounded RGBA transport at the selected Full/Half/Quarter preview resolution and require native GPU integration/validation. Hardware video encoding remains selected on those platforms. The fallback does not force software decoding or alter process-wide decoder ranks.

This V1 supports finite media up to six hours and a canvas up to 4096 pixels per axis. The zoom port covers Beam's 2D camera behavior. Legacy 3D tilt, captions, transitions, speed ramps and arbitrary third-party effects are outside this V1. The screenshot editor remains in Electron. The recorder's narrow private runtime profile does not cover NLE plugins; this editor currently requires the user's installed GStreamer/GES runtime.

## Focused verification

```sh
bun run --filter @beam/native-ui check
bunx vitest run --config packages/beam-ui/vitest.config.ts --coverage
cargo fmt -p beam-editor-engine --check
cargo nextest run -p beam-editor-engine --test editor
# On a machine with a compatible GPU/encoder (explicit hardware checks):
cargo nextest run -p beam-editor-engine --test editor --run-ignored all
cargo clippy -p beam-editor-engine --all-targets -- -D warnings
python3 scripts/ci/check_rust_test_layout.py
cargo nextest run --manifest-path apps/beam-native/Cargo.toml --test native_editor --run-ignored all
cargo nextest run --manifest-path apps/beam-native/Cargo.toml --test solid_bundles \
  -E 'test(native_editor)' --run-ignored all
```

Offscreen Linux GPU tests use GST_GL_PLATFORM=egl and GST_GL_WINDOW=surfaceless without creating windows. Hardware encoding and Intel VA regression checks are explicitly ignored in ordinary device-free CI and must be run on a matching GPU.

Run graphical scenarios with `vendor/argui/scripts/linux-hidden-display.sh` and `linux-wayland-capture.py`; keep test preferences and media in `/tmp`. Inspect empty and populated projects, selection, scrubbing, trimming/splitting, export controls and both theme variants. Windows/macOS GUI, codec and packaged-runtime checks require their native platforms.

## Recording quality and Concat geometry

See [native-editor-quality.md](native-editor-quality.md) for the inspected recording, matched-source before/after measurements, reference revision, supported UI operations, remaining visual differences and user test commands.

## Responsive panels, sequences and source visuals

The wide workspace keeps three panels. Between 920 and 1259 logical pixels, the
preview shares the top area with the selected Media/Properties pane. Below 920,
shared pane tabs expose one full-width pane. Native minimum size is 720×480.
User splits persist as proportions through window resizing. Centered primary
orange pills appear only on hover with a 120 ms native color fade. Native
`TouchArea` resize handles update measured pane bounds directly in Rust, with no
JavaScript callback during movement and one final size commit on release. Pane
dimensions have no transition; cancellation restores the previous retained size.
Flexible siblings and percentage-sized panel roots follow the native override.

A separate row of shared native Tabs selects up to 16 independent sequences.
Each stores tracks, clips, canvas and its bounded undo/redo history. The source
library belongs to the project. Sequence switches pause and reset playback;
selection changes do not consume clip history. Single-sequence documents migrate
on read, and every saved sequence/history is validated against the shared library.

Audio and video use one typed acquire/release service and source-time identities.
The union of current subscribers holds one native lease per request. Only visible
clip rows/time ranges and virtualized library cards request artwork. A bounded
128-entry LRU evicts inactive entries; offscreen pending jobs cancel. GPU IDs and
status cross the JS boundary, while samples/pixels remain in Rust. Retry reacquires
failed visual leases while keeping completed visuals available.

Source processing runs on a parked worker independent of the playback actor.
Video reuses two paused GES source decoders for sparse accurate seeks, with frames
limited to 256 pixels. A power-of-two source-time grid reuses samples when panning,
trimming and zooming within a grid level; completed frames remain cached across
levels. It never schedules sequential full-file decoding for thumbnails.

Audio streams 48 kHz float PCM for requested tiles only, with at most four queued
buffers and eight seconds per work turn. Requests are limited to 120 seconds and
2048 compact peak/frequency bins. A 32-slice cache pools equal/finer completed bins;
only missing/insufficient detail decodes again, and cancelled jobs preserve prior
completed bins. The filters/RMS mapping match the existing browser Blick analyzer.

QuickJS has no WebGL context: the existing Blick GLSL analysis and four mountain
shells are ported to WGSL on Argui's GPU. Shared immutable pipelines calculate
one envelope per column and render four strips. Missing bins stay transparent.
Ready overlapping tiles keep their exact source placement during refinement,
with a 160 ms compositor crossfade and bounded outgoing resources. No idle JS
animation loop or whole-file PCM buffer is used.
