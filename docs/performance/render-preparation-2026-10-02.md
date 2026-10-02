# Retained render preparation

The 10,893-clip desktop project contains 10,000 rectangles spanning the same 60-second interval. These changes remove repeated preparation in preview and export without changing drawing quality or document contents.

## Temporal query and paint order

The engine retains one ordered active window until a clip boundary changes membership. It still evaluates animation, visibility and source time every frame. Composition edits rebuild the resolver; reverse seeks query the correct window. Queries inside floating-point snapping bands retain the original query semantics, including very short intervals. Timing gesture previews remain live.

The focused benchmark reads the original project without writing it, compares every returned clip and its order, then alternates the original interval-query/sort path and retained queries. Each sample executes 60 ticks over the first second, after five warmups. There are 40 samples on Linux, an Intel Core Ultra 5 125H and Bun 1.4.2; 10,129 records are active at the first tick.

| Preparation for 60 queries | Median | p95 |
| --- | ---: | ---: |
| Original interval query and sort | 54.46 ms | 171.72 ms |
| Retained ordered window | 0.009 ms | 0.021 ms |

Index construction took 3.14 ms for the original path and 5.15 ms for the retained path in one cold sample. The additional boundaries are prepared after edits, rather than on every playback tick. Construction measurements are single observations, not distributions.

This benchmark excludes animation sampling, layer categorization, drawing, decoding, encoding and presentation. It does **not** establish a playback FPS or export throughput gain. See [recorded results](render-preparation-2026-10-02.json) and the earlier [completed dense preview measurements](preview-dense-2026-10-02.md).

```sh
bun scripts/performance/benchmark-render-preparation.ts /path/to/project.json
```

## Fixed backgrounds and text

A focused preview test paints a fixed background once over 60 ticks, invalidating it for pixel-input changes, dimensions, drawing failure and disposal. Host tests verify deep gradient edits, blur, loaded image replacement, empty backgrounds and live video/transition behavior. Export already prepares fixed backgrounds once.

The common caption painter retains at most 512 measurements and 128 layouts per weakly owned context, rejecting keys over 4,096 characters. It observes actual font/spacing settings, wrapping, dimensions, transforms and the host's font collection. Loading fonts bypass retention; loaded face additions, removals and replacement identities invalidate existing metadata. Mutable transform drafts cannot rewrite retained layouts. Animated text, highlights and cursor-follow geometry still paint normally.

Real displayless Chromium compares retained text rendering against fresh contexts across 60 repeated ticks, text/spacing/size/wrapping edits, reverse changes, and late imported-font loading/removal. There are zero differing RGBA channels, and unchanged ticks perform zero additional native text measurements. Existing completed preview/export checks cover scenes, decoded media, camera/cursor motion, generated text, masks, transitions and GPU blur.

## Export progress thumbnails

The encoder copies a small progress thumbnail at most every 500 ms and permits only one JPEG conversion in flight. Video frames continue while that conversion awaits its result; a worker test encodes all 30 frames before releasing the pending first thumbnail. Final completion settles that conversion, propagates errors and rechecks cancellation. Disposal prevents late thumbnail publication and releases its owned canvas after pending work finishes.

These count, ownership and pixel checks establish the work avoided and preserved behavior. Windows/macOS hardware export and visible playback FPS have not been measured in this environment.

## Verification

- 209 focused engine/runtime/encoder/component tests pass across 15 files.
- All 10 completed-image Chromium cases pass, including the 10,000-rectangle fractional-zoom comparison. They ran in two focused invocations.
- Coverage for the retained preparation core (`ordered-timeline-index`, `scene-layers`, `caption-text-cache`, `export-preview`, `runtime-preview`) is 97.84% statements, 92.92% branches, 98% functions and 99.58% lines. This is a targeted core coverage result, not coverage for every existing host/painter adapter or the entire application.
- Vue/package type checking, package boundaries, formatting, lint and desktop/CLI production builds pass.
- A compiled CLI export with progress thumbnails enabled succeeds with both DISPLAY and WAYLAND_DISPLAY unset. `ffprobe` verifies VP9, 320 × 180, 24 decoded frames and a one-second duration. The job-owned temporary directory and output are removed after verification.
