# Timeline stress and dense Soft Signal — 2026-10-01

## Scope and real fixtures

This follows [the earlier VP9/shape-heavy investigation](soft-signal-performance.md).
That report used an older 98-clip project. This run freezes the newer Soft Signal,
updated at `2026-10-01T15:49:43.005Z`: 150 saved clips, including 39 blurs,
61 shapes, 14 imported VP9 video instances, 29 captions, four screen clips and
three audio clips. Export is 15.5 seconds, 1920 × 1080, 30 fps. Its imported
five-second VP9 WebM is unchanged.

Two independent projects were created in the user's actual Videos directory:

- `Vidéos/Beam/user/projects/studio/project-beam-stress-10000-blurs`:
  **Beam Stress — 10,000 blurs random — 60s**. Seed 7458, 10,000 enabled,
  independent blur lanes, random positions and 1–4 second intervals over a minute.
- `Vidéos/Beam/user/projects/studio/project-beam-stress-2000-simultaneous`:
  **Beam Stress — 2,000 blurs simultaneous — 60s**. All 2,000 effects remain
  enabled for the entire minute.

Both repeat the real screen recording, retain the source blur strength/feather,
and copy the media into their own project directory. They have independent
project IDs and preview URLs. The normal loader migrates the legacy saved schema.
Keyboard captions generated from the recording can change total clip counts
during initialization; the blur count and measured paste deltas are exact.
All 15 original Soft Signal files still match the frozen copy's SHA-256 hashes.
No original project was saved or edited by the harness.

## Measurement method

Raw measurements and fixture fingerprints are in
[the data file](performance/timeline-stress-2026-10-01.json).

Production-built Electron 44.5.1 / Chromium 152 runs the actual Vue timeline,
MediaBunny decoders, canvas compositor and export worker on Linux / Intel Core
Ultra 5 125H. The editor is presented on a private Mutter/XWayland 60 Hz display,
not hidden/throttled and never on the user's desktop. The export diagnostic
reports ANGLE / Intel Arc / Mesa hardware canvas rendering; AVC encoding uses
OpenH264 software on this machine. Audio is decoded/scheduled with output muted;
the private display has no usable ALSA output device.

Every trial gets fresh temporary preferences, media paths and Chromium storage.
OS disk caches are **not** cleared. No builds or tests run concurrently with
the retained timing trials; this remains a shared computer, not an isolated lab.
Most interactive comparisons are one trial per build, not statistically robust
medians across repeated runs. The export comparison has two baseline and two
optimized trials, with substantial total-time variation.

Loading measures from the real `openEditor` call to the first uncovered preview.
After three seconds of settling, the standard workload runs six seconds of
playback, 40 deterministic exact seeks over 0–7.8 seconds, and 120 nominal-60-Hz
scrub requests followed by an exact seek at four seconds. Native export covers
**all 465 frames**, not just the dense opening. A separate stress playback trial
runs for the full minute, crossing the repeated recording's cut boundaries.

Copy/paste dispatches the application's Ctrl+C and paste event handlers with
real selection/clipboard state. Only the native clipboard text write is stubbed
in this private harness, so the user's OS clipboard is not overwritten; its
external IPC/write time is not included. Handler time is synchronous work;
complete paste time also waits for two animation-frame opportunities. Drag uses
30 actual pointer updates followed by cancellation, so it does not permanently
move clips. Twenty vertical scroll positions cover the complete document.

Canvas draw time excludes deferred GPU work. Animation-frame gaps are main-thread
cadence, **not measured displayed video FPS**. Frame-version increments are not
distinct frames presented. These distinctions matter especially with thousands
of sequential backdrop blurs.

The valid baseline is the frozen working tree before these timeline changes,
already containing the earlier preview VP9 fix. Its export initially fails on
Linux AV1/VP9 decoding. Export comparisons therefore apply **only** the buffered
software decoder policy to that baseline, so both sides successfully render the
same input. A decoder crash is not counted as a speed improvement.

## Results

| Soft Signal, same workload | Before | Optimized |
| --- | ---: | ---: |
| First uncovered preview | 2.06 s | 1.49 s |
| Mounted timeline rows / items after loading | 105 / 153 | 9 / 10 |
| Playback main-thread rAF gap, median / p95 | 57.1 / 166.1 ms | 28.1 / 71.1 ms |
| Playback canvas draw, p95 | 28.8 ms | 16.8 ms |
| Forty exact seeks, complete wall time | 19.07 s | 10.09 s |
| Paste 100 clips, handler / complete time | 256.5 / 819.5 ms | 45.4 / 188.3 ms |
| Drag update including next frame, median | 94.1 ms | 20.7 ms |
| 120 wide scrubs, complete wall time | 3.11 s | 3.39 s |
| Full 15.5-second export, two trial range | 24.16–32.43 s | 20.50–23.92 s |
| Export synchronous canvas render total | 11.54–11.69 s | 6.89–8.42 s |

Scrubbing wall time does not improve in this particular comparison. Export
remains longer than the video duration, despite lower render work and successful
full-resolution output. Deferred GPU/encoder backpressure is still significant;
it cannot be described as pure encoding CPU time.

| Stress workload | Measured result |
| --- | ---: |
| 10,000-blur project opening before / optimized | 51.00 / 4.88 s |
| Optimized opening DOM rows / items | 9 / 9 |
| Copy all 10,000 blurs, handler / complete | 68.7 / 646.1 ms |
| Paste all 10,000, handler / complete | 1.57 / 4.88 s |
| Exact document count before / after paste | 10,013 / 20,013 |
| Drag after this 10,000-item paste, median / p95 | 39.8 / 82.4 ms |
| Maximum mounted rows / items across full scroll | 13 / 32 |
| Five repeated 1,000-item pastes, complete | 4.60 s for 5,000 new clips |
| Random-stress six-second playback rAF, median / p95 | 87.3 / 291.0 ms |
| Random-stress six-second canvas draw, median / p95 | 16.5 / 85.5 ms |
| Random-stress full-minute playback, wall time | 60.06 s, no playback error |
| Full-minute main-thread rAF gap, median / p95 | 183.7 / 405.7 ms |
| Full-minute canvas draw, median / p95 | 27.8 / 78.8 ms |
| 2,000 simultaneous blurs, draw median before mask/fusion / optimized | 2,530.9 / 140.0 ms |
| 2,000 simultaneous blurs, optimized rAF median / p95 | 552.9 / 1,045.8 ms |

The full-minute trial reaches the normal loop boundary and finishes just after
returning to the start. It reports one audio buffer 42.7 ms late and no audio
scheduling errors; audible output is not validated on the private display.

The old stress trial reaches its **300-second overall deadline during a
1,000-item paste**; there is no completed baseline paste duration. It is not a
like-for-like 10,000-item comparison. Only its opening measurement is retained
for a clean comparison: later phases overlapped other work and are excluded.

A separate CPU trace of the first virtualized implementation found approximately
51% of drag samples in Vue's deep `traverse`. Marking immutable gesture snapshots
raw at the Vue boundary removes this scan. The intermediate implementation took
about 1.20 seconds per drag update after a 1,000-item paste; the final implementation
measures 39.8 ms even after a larger 10,000-item paste. These document sizes differ,
so this is a bottleneck diagnosis, not an identical-dataset speedup percentage.

**This does not establish 60 fps playback of thousands of effects.** The random
10,000-effect project has hundreds of active effects at a time, not 10,000
simultaneously. The separate 2,000-simultaneous case still stutters substantially.
Its synchronous renderer is much cheaper, but sequential full-resolution
backdrop operations still saturate the browser/GPU pipeline. Between compared
builds, no effects, overlaps, feathering or resolution were disabled.

## Implementation

- One shared, frame-coalesced viewport measures scroll/resize for rows, ruler,
  thumbnails and waveforms. Headers and content share absolute row geometry and
  complete scroll extent. Variable-height lanes redistribute available space
  like flex layout. Interval indexes query only horizontal intersections.
- Only visible rows/items plus one focused or dragged item remain mounted.
  Selection-box geometry uses the full model, so offscreen clips remain selectable.
  Audio lanes do not start waveform workers until visible.
- Bulk paste indexes lanes/assets once, stages overwrites, and validates/normalizes
  once. Ordered fragments append without rescanning their lane. Clipboard snapshots
  and gesture emissions avoid deep Vue proxies. Collision bounds use sorted lane
  boundaries instead of selected-clips × stationary-clips scans.
- Video instances share one decoded bitmap/sample only when their full source/time
  mapping matches. Visual appearance, layer order and transforms remain independent.
  Sample/bitmap ownership closes each resource once, including failures/retiming.
  Current scene frames cannot be evicted by the 64 MiB seek-history target.
- Full-resolution blur fuses crop/filter into one draw, sampling the current
  backdrop for each effect in original order. Geometry-only feather masks reuse
  exact physical scratch dimensions. The cache is bounded to 128 masks / 32 MiB;
  once full, uncached geometry uses the scratch mask instead of allocating and
  evicting canvases every frame. Custom mask callbacks remain uncached.

Eighteen native accelerated-Canvas2D fixtures (blur, frosted, pixelation, opaque,
edge crops, feathering, external source and custom masks at three scales) produce
identical RGBA SHA-256 hashes before/after. The **entire decoded export** has the
same SHA-256 `7037a8fccf0312424e4998256a6b4a1154e315f650aaa049827d298b08103066`
before/after. `ffprobe` confirms AVC + AAC, 1920 × 1080, 30 fps, 465 frames and
15.500 seconds. One exported frame was also visually inspected.

## Verification and reproduction

406 tests in 41 directly related Vitest files and three stress-generator Node
tests pass. Focused coverage over 20 affected modules passes the unchanged
90% gate: 94.61% statements, 90.58% branches, 97.25% functions, 96.50% lines.
Vue type checking, normal production Vite build, changed-source formatting,
script syntax and diff checks pass. Profiling probes are absent from the normal
build. Plain TypeScript checking retains the same nine pre-existing errors in
CursorAppearanceControls, CanvasAddMenu and quick-snip-export tests; no new
TypeScript errors remain. No repository-wide test/coverage run or Rust build
was used. Windows/macOS native integration and audible output were not tested.

The existing `setHudAlwaysOnTop` preference error appears on both builds and is
not fixed by this change. Private-display ALSA/portal messages are not media
decoder errors. Wrong-basename initial trials that could not resolve media and
intermediate regressions are excluded from comparison figures, not disguised
as functioning baselines. Release notes are in `CHANGELOG.md` Unreleased.

Use a fresh directory outside the repository:

```sh
node scripts/performance/profile-preview-build.mjs /absolute/temporary/build
```

Launch `scripts/performance/profile-editor.cjs` with the private display and
environment shown in the earlier report. Preserve the source project's directory
basename so relative project-media routes remain valid. Additional switches:

- `BEAM_TIMELINE_PROFILE_WORKLOAD=1`: copy/paste, drag and full vertical scroll.
- `BEAM_TIMELINE_PROFILE_SELECTION=10000`: copy all stress effects.
- `BEAM_TIMELINE_PROFILE_REPEATS=5`: five additional paste events.
- `BEAM_TIMELINE_PROFILE_ONLY=1`: skip playback/seeking for UI/export-only trials.
- `BEAM_PREVIEW_PROFILE_PLAYBACK_ONLY=1`: skip exact seeks/scrubs.
- `BEAM_PREVIEW_PROFILE_PLAYBACK_MS=60000`: full-minute playback.
- `BEAM_EXPORT_PROFILE_DEST=/absolute/fresh/tmp/output.mp4`: real native export;
  existing files and paths outside the temporary directory are rejected.
- `BEAM_BLUR_QUALITY_PROFILE=1`: native pixel-equivalence fixtures.

The stress generator rejects existing destinations:

```sh
node scripts/performance/create-timeline-stress.mjs SOURCE NEW_TARGET 10000 random
node scripts/performance/create-timeline-stress.mjs SOURCE NEW_TARGET 2000 simultaneous
```
