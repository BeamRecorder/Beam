# GPU rendering: video, shapes and live backdrops — 2026-10-01

This follows the [timeline/Soft Signal work](timeline-stress-performance.md).
The subsequent [engine/scrub/sparse-drag and retained-GPU pass](engine-performance.md)
has a separate frozen baseline and measurements; its rectangle batching must not
be attributed to the native-shadow measurements below.
The baseline here is the working tree frozen **after those improvements**, not
the earlier commit with failing VP9 decoding or an unvirtualized timeline.
The same 150-clip Soft Signal copy retains its original media and 1920 × 1080,
30 fps output. No original project is opened for writing.

## What changes

- Adaptive shadows sample each immutable video/image frame and source crop once.
  Before painting the visual stack, up to 128 independent 8 × 8 samples share
  one GPU readback. Mutable sources are not memoized; new decoder frames and
  changed crops/colors remain independent. Weak ownership never closes or
  retains a decoder's bitmap. Persistent sampling is limited to 32 variants
  per immutable source.
- Repeated geometric media shadows can reuse full-resolution rasters: 128
  entries / 64 MiB per output context. Fractional device phases and complete
  transforms remain in the key; only integer translation is shared. Two-hit
  admission avoids allocating textures for unique drag/camera phases (at most
  256 pending keys). Full caches stop admission rather than churn allocations.
  Video pixels are **never** cached by this mechanism.
- Scaled appearance shadows stay native. A real-preview pixel comparison found
  that flattening their subpixel edge guards changes contours. This path was
  rejected; adaptive color batching still applies. Opacity, blending, filters
  and incompatible inherited shadows also retain native painting.
- Blur masks are rasterized with the original physical scratch bounds, then
  retained as compact logical regions without rescaling. Destination-in only
  touches the region subsequently presented. The 32 MiB budget now admits up
  to 1,024 small masks rather than 128 potentially oversized textures.
- Catalog shapes reuse bounded transformed paths. Shape backdrop masks can
  reuse explicitly keyed immutable geometry; arbitrary callbacks stay live.
  Every sequential effect still samples the already composed backdrop, in
  the original order and at the original resolution.
- Editor/export teardown explicitly releases retained primary-context shadow,
  mask and scratch surfaces. Weak context/source ownership prevents caches
  from retaining disposed renderers or frames.

No media transcoding, preview-quality reduction, disabled layers, frame skipping
or changes to paint order are used to obtain these gains. Native colored shape
painting is unchanged: a whole-shape raster prototype changed antialiased edges
and was removed, not shipped.

## Measurement method

[Measurement data](performance/gpu-rendering-2026-10-01.json) records retained
trials, hardware, quality checks and rejected intermediate implementations.
Linux, Intel Core Ultra 5 125H, Electron 44.5.1 / Chromium 152, ANGLE / Intel Arc /
Mesa. The real 1280 × 800 editor is presented on a private Mutter/XWayland
display with fresh preferences/storage/media paths for each launch. OS caches
are not cleared, and other desktop applications remain open. No builds or tests
run concurrently with retained performance phases.

Native Canvas2D diagnostics use real decoded VP9 pixels on a 1920 × 1080 output.
Each case has two warmups and 12 measured frames. Timings include synchronous
RGBA readback to finish deferred drawing, **not pure GPU hardware timestamps or
displayed FPS**. Direct-media and optimized paints alternate order within the
same process to control desktop-load/temperature differences. The direct-media
control disables color memo/batching and media shadow rasters only; it does not
undo shape-path or compact-mask changes.

The 128-fresh-image case creates independent immutable bitmap views each frame,
from four real decoded source times, with 640 × 360 diagnostic input views.
Creation is outside the timed region; all views close afterward. It does not
claim to run 128 independent video decoders. The output resolution and pixels
are identical between compared paths.

Separately, the actual editor plays both Soft Signal and the mixed fixture for
30 seconds. Soft Signal also performs 40 exact seeks, 120 wide scrub requests,
and exports all 465 frames. Animation-frame cadence is main-thread opportunity,
not a count of distinct images presented. Most end-to-end comparisons are
single trials, so loading/export variations are not reliable speedup claims.

## Results and limits

The paired native video cases establish lower rendering/readback cost, including
fresh independent frame identities rather than only copied blur geometry. The
raw data distinguishes solid, adaptive, fresh-adaptive and squircle media.

| Final paired native case, completed median | Direct media control | Optimized |
| --- | ---: | ---: |
| 128 solid-shadow video instances | 54.8 ms | 27.5 ms |
| 128 adaptive-shadow aliases of four immutable frames | 1,451.0 ms | 23.3 ms |
| 128 fresh independent adaptive-shadow bitmap views | 376.4 ms | 37.2 ms |
| 128 squircle-masked video instances | 74.3 ms | 27.0 ms |

An earlier alternating trial measured 284.7 → 43.8 ms for fresh views; these
are small native trials, not a universal 10× application speedup. Shape/blur
rows in the direct-media control execute identical optimized shape/blur code,
so their timing differences are **noise, not evidence of a shape/blur gain**.
GPU saturation remains substantial with thousands of native shadowed shapes
or sequential full-resolution backdrops; there is **no demonstrated general
GPU speedup for ordinary colored shapes**.

The mixed fixture contains 64 real VP9 video lanes in four source-time phases,
128 native/catalog shapes and 64 blur/frosted effects over a full minute, plus
the real repeated AV1 screen recording. Decoder sharing only occurs for exact
source/time mappings. Its project has an independent ID and copied media:

`Vidéos/Beam/user/projects/studio/project-beam-stress-mixed-gpu`

Search for **Beam Stress — mixed GPU — 64 videos + 128 shapes + 64 effects — 60s**.
This fixture deliberately disables zoom motion blur, unlike unmodified Soft
Signal. Its 30-second playback test is not a full-minute export test.

The final mixed implementation lowers median main-thread cadence and median
draw duration, but long GPU stalls remain. Tail latency does not improve in
the final quality-preserving trial. It cannot be called smooth 30/60 fps
playback. The separate 2,000-simultaneous-blur trial also still stutters.

| Real editor, 30-second playback | Frozen baseline | Final quality-preserving build |
| --- | ---: | ---: |
| Mixed preview ready | 2.46 s | 2.70 s |
| Mixed draw median / p95 | 842.0 / 985.3 ms | 25.9 / 1,118.4 ms |
| Mixed rAF gap median / p95 | 718.2 / 991.4 ms | 167.0 / 1,061.2 ms |
| Soft Signal rAF gap median / p95 | 33.4 / 90.1 ms | 43.9 / 190.1 ms |
| Soft Signal 40 awaited seeks, wall | 10.75 s | 11.61 s |
| Soft Signal 120 wide scrub requests, wall | 2.80 s | 2.85 s |
| Soft Signal complete export | 26.26–45.71 s (two trials) | 29.70 s |
| Soft Signal synchronous export rendering | 6.91–8.22 s | 7.75 s |

There is no demonstrated additional end-to-end speedup for Soft Signal in this
pass; its playback tail is worse in this final single trial. The earlier
timeline/decoder gains still apply, but must not be attributed to these changes.

A separate trace around six seconds of intermediate-build playback contains
nine `ReadbackImagePixels` waits,
totalling 2.35 seconds, with a 425.6 ms maximum, plus long raster/command flush
work. These are instrumented browser/driver scopes, not hardware GPU execution
times; nested durations must not be added together. The trace is diagnostic
and excluded from the untraced timing comparisons. Removing the remaining
synchronous GPU waits and reducing native shadow/backdrop raster work are still
necessary for reliable dense-scene realtime playback.

Soft Signal's software AVC encoding/backpressure remains a major export cost.
Neither an overall startup improvement nor a robust export-time improvement
is established by this GPU pass. Successful full-resolution export is verified,
but is still slower than the video's duration on this shared machine.

## Quality and verification

- All eight native stress-case RGBA hashes match the frozen baseline and their
  direct-media reference paints.
- Forty media/frame/affine comparisons: 37 bit-exact; the remaining three
  differ in four channel bytes total, each by 1/255.
- The real Soft Signal preview is bit-exact against direct native paints at
  nine timeline positions from 0 to 14.2 seconds, after the scaled-appearance
  safeguard. Repeated optimized and direct draws are independently stable.
- The mixed preview also matches at eight stable positions from 0.6 to 14.2
  seconds. Its first paint at zero fails the optimized-repeat stability
  control during initialization and is excluded, not counted as an exact match.
- All 18 accelerated blur/frosted/pixelated/opaque/custom-mask fixtures retain
  their earlier RGBA hashes.
- Full decoded AVC exports are compared separately: lossy encoded output is
  not claimed bit-exact. Native pixel checks do not substitute for this check.
  Export dimensions, frame count, audio stream, hashes and PSNR/SSIM are in
  the measurement data; an actual exported frame was visually inspected.

The final export has 465 AVC frames over 15.500 seconds at 1920 × 1080 / 30 fps,
plus AAC audio (container duration 15.531 seconds). Compared with the native
baseline, decoded-video SSIM is 0.999043 and average PSNR 57.812 dB; the decoded
hash differs. Do not describe the complete export as bit-exact. The proof is
saved separately as `Vidéos/Beam-performance/Soft Signal - GPU performance.mp4`.

266 focused Vitest tests in 19 files and three generator Node tests pass.
Coverage of the seven critical optimization modules is 100% statements,
98.66% branches, 100% functions and 100% lines, above the unchanged 90% gates.
Vue type checking, normal Vite build, changed-file formatting/lint, script
syntax and diff checks pass. Production
builds contain no profiling/quality probes. Plain TypeScript checking retains
the nine previously documented errors in CursorAppearanceControls, CanvasAddMenu
and quick-snip-export tests. No full repository test/coverage or Rust build is
run for this localized renderer change. Windows/macOS GPU behavior and audible
output are not validated; the private display lacks a working ALSA device.
The existing `setHudAlwaysOnTop` harness preference error is unrelated and remains.

## Reproduction

Create a fresh instrumented build outside the repository:

```sh
node scripts/performance/profile-preview-build.mjs /absolute/temporary/build
```

Run `scripts/performance/profile-editor.cjs` with that build as
`BEAM_EDITOR_PROFILE_ROOT`, a real project copy as `BEAM_EDITOR_PROFILE_SOURCE`,
and `BEAM_PREVIEW_PROFILE_WORKLOAD=1`. The native private-display wrapper is
required for `BEAM_EDITOR_PROFILE_VISIBLE=1`; hidden windows throttle and are
not valid playback comparisons. Use `BEAM_GPU_RENDER_PROFILE=1` for paired
native cases, or both `BEAM_MEDIA_QUALITY_PROFILE=1` and
`BEAM_BLUR_QUALITY_PROFILE=1` for pixel checks. `BEAM_GPU_TRACE` accepts a fresh
temporary trace file. Export destinations must also be fresh temporary files.
The harness copies the project, uses isolated preferences and never writes to
the source. `create-mixed-gpu-stress.mjs SOURCE NEW_TARGET` creates a separately
editable fixture and refuses existing or source-nested destinations.
