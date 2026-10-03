# Soft Signal: VP9 import and shape-heavy preview — 2026-10-01

## Reproduction and scope

The real Soft Signal project contains 98 clips: 61 shapes, 29 captions, four
screen fragments, three audio fragments and one imported video. There are 37
active shapes at the beginning. Its imported WebM is valid VP9 profile 0,
1920 × 1080 at 60 fps, approximately five seconds long. The original decoder
policy reproduces `EncodingError` in both sequential decoding and exact seeking
of this asset; Chromium also logs VA-API context initialization failures.
Advertised codec support is therefore not proof of usable hardware decoding.

Linux VP9 now explicitly uses `prefer-software` with `optimizeForLatency: false`,
the same buffered policy already used for Linux AV1 playback. Playback workers,
thumbnail workers and video posters use this policy. Other codecs and other
platforms keep their existing decoder preferences. This does not transcode,
replace or reduce the resolution of the imported file.

Profiling uses a frozen copy, then a fresh temporary media/preferences/Chromium
profile for every trial. All 15 files in the original project still match the
frozen copy's SHA-256 hashes after the trials. No original project is saved by
the harness.

## Method

Three alternating before/after pairs use actual production-built Electron,
MediaBunny decoders, Vue timeline and canvas rendering. The baseline is commit
`3fdf4bd9cb778faa9a55f8608818e33cf574de17` **with only the VP9/poster decoder
policy correction applied**. Both sides thus have functioning, identical video
decoder policies; a crashing hardware baseline is not used to claim speedups.

The machine is Linux with an Intel Core Ultra 5 125H, Electron 44.5.1 and
Chromium 152.0.7977.130. A 1280 × 800 editor is actually shown on a private
headless Mutter/XWayland display, never on the user's desktop. Chromium reports
accelerated 2D canvas/compositing. The saved 1920 × 1080 output settings and
normal preview quality/effects are retained. Audio is decoded and scheduled,
with output muted. No builds or tests run concurrently with the timed phases;
the machine remains shared and OS file caches are not cleared.

After first visible preview, each trial settles for three seconds, then runs:

- Six seconds of playback starting at zero.
- Forty awaited exact seeks, deterministically permuted across 0–7.8 seconds,
  each followed by a renderer animation-frame opportunity.
- 120 wide scrub requests across 0–7.93 seconds, issued with a nominal 60 Hz
  timer, then an awaited exact seek at four seconds. Timer delays and decoding
  backlog are included in the measured wall time, not hidden behind a theoretical
  two-second duration.

The project is approximately 12 seconds long; these phases target its dense
opening and the complete imported video's timeline range, not every possible
interaction or the full application's launch-from-boot path. CPU profiles taken
separately identify repeated full-scene sorting/source-time queries in camera
simulation and repeated linked-clip searches during playback, as well as shape
thumbnail rendering/readback during loading.

## Results

Values are medians of three trial measurements. For p95 rows this means the
median of each trial's p95, not a pooled percentile. Per-trial measurements and
decoder/platform details are preserved in
[the measurement data](performance/soft-signal-2026-10-01.json).

| Measurement | Before | After |
| --- | ---: | ---: |
| Shape thumbnail rasterizations after loading | 61 | 3 |
| Playback canvas render duration, p95 | 22.2 ms | 14.2 ms |
| Exact-seek canvas render duration, p95 | 41.9 ms | 13.3 ms |
| Wide-scrub canvas render duration, p95 | 39.0 ms | 15.1 ms |
| Complete 120-request wide scrub | 5.88 s | 4.02 s |
| Wide-scrub renderer CPU time | 31.76 s | 23.21 s |
| Wide-scrub main-thread animation-frame gap, p95 | 73.3 ms | 33.4 ms |
| Exact seek including decoding and next animation-frame opportunity, median | 214.9 ms | 191.9 ms |
| Exact seek including decoding and next animation-frame opportunity, p95 | 342.2 ms | 349.2 ms |
| Playback renderer CPU time | 12.87 s | 12.18 s |
| First visible editor preview | 1.89 s | 2.03 s |
| Startup long-task time exceeding 50 ms | 835 ms | 830 ms |

Canvas render p95 decreases by 36% in playback, 68% during exact seeking and
61% during wide scrubbing. Wide-scrub wall time decreases by 32% and renderer
CPU time by 27%. Renderer CPU sums user/system ticks across its threads, so it
can exceed elapsed time; it does not include every Electron/GPU/native process.
Canvas timing measures the real render function, including synchronous browser
work, but not final compositor/GPU presentation. Animation-frame cadence is not
a count of distinct video frames shown to the user.

**There is no demonstrated overall loading improvement.** Preview readiness
ranges from 1.77–2.15 seconds before and 1.68–2.08 seconds after. Reducing shape
thumbnail work by 95% does not imply the entire startup becomes 95% faster.
The long-task measure sums excess duration above 50 ms; it is not a Lighthouse
TBT or INP score.

All six comparison trials complete without playback/seek/thumbnail failures;
their audio metrics report no scheduling errors or late buffers. This does not
establish perfect 60 fps playback. Exact-seek tail latency does not improve,
playback animation-frame p95 remains about 50 ms, and one optimized playback
trial still has a 456 ms animation-frame gap. Media decoding, GPU/browser work
and first editor initialization remain significant costs. Windows/macOS native
playback and audio-output devices were not exercised.

The harness also logs the existing `preferences:update` error about
`setHudAlwaysOnTop`, on both versions. That independent native-preference issue
is not counted as fixed. Private-display ALSA/portal/compositor messages are not
media decode failures. Earlier fully hidden trials had approximately one-second
animation-frame throttling and are excluded from performance comparisons.

## Implementation and verification

- Camera simulation queries an interval index containing only screen clips,
  preserving frontmost/stable order and half-open cut boundaries. It no longer
  sorts or reads the shapes at every intermediate zoom sample. Immutable
  composition replacement or explicit camera reset rebuilds the index.
- Per-composition linked-clip names and selection arrays retain their identity
  during playback. Composition/selection edits still refresh their consumers.
- Shape previews share pending font/rasterization work and completed artwork by
  visual signature, independent of placement, timing and clip identity. The LRU
  retains at most 64 entries and 4 MiB of key/PNG string bytes; final subscriber
  release clears it. Late work cannot overwrite edited or unmounted previews.
  Fill-enabled changes now invalidate the thumbnail too.
- Visual-label and selection types are separated by responsibility to keep the
  affected production files below 500 lines. No IPC, native window or Rust
  capture behavior changes.

329 tests in 23 directly related files pass. Focused coverage for the 13 affected
implementation modules is 97.34% statements, 91.77% branches, 93.02% functions
and 97.93% lines. New cache/index/policy modules have 100% coverage. Vue type
checking, production Vite build, changed-file lint/format checks and profiling
script syntax checks pass. Plain TypeScript checking reports exactly the same
pre-existing errors as a separate HEAD snapshot: CursorAppearanceControls and
CanvasAddMenu tests, and missing cursor `enabled` in quick-snip-export tests.
No full repository suite/coverage or Rust validation was run for this localized
renderer change. User-visible notes are included in `CHANGELOG.md` Unreleased.

## Repeating the workload

Create an instrumented build outside the repository; probes are never included
by the normal production build:

```sh
node scripts/performance/profile-preview-build.mjs /absolute/temporary/build
```

`BEAM_PREVIEW_PROFILE_BUILD_ROOT` can select a separate baseline source checkout.
Use a fresh output directory for each build. Launch the existing editor harness
inside a private Linux display wrapper that sets `ARGUI_HIDDEN_DISPLAY=1`:

```sh
ARGUI_TEST_BACKEND=x11 \
BEAM_EDITOR_PROFILE_VISIBLE=1 \
BEAM_EDITOR_PROFILE_SOURCE=/absolute/path/to/frozen-project \
BEAM_EDITOR_PROFILE_CATALOGUE=/absolute/path/to/original-project-catalogue \
BEAM_EDITOR_PROFILE_ROOT=/absolute/temporary/build \
BEAM_CAPTURE_ENGINE=/absolute/path/to/capture-engine \
BEAM_EDITOR_PROFILE_OUTPUT=/absolute/temporary/result.json \
BEAM_PREVIEW_PROFILE_WORKLOAD=1 \
/absolute/path/to/linux-hidden-display.sh \
node_modules/.bin/electron scripts/performance/profile-editor.cjs --ozone-platform=x11
```

Without a private display, keep the harness's default hidden mode for loading
inspection only; do not use it to claim native-visible playback cadence.
`BEAM_PREVIEW_PROFILE_CPU=/absolute/temporary/profiles` optionally writes loading
and per-phase Chromium CPU profiles. Keep sampling separate from timing trials
and use the same instrumentation on both builds.
