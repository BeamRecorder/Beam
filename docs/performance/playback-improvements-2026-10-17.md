# Playback work reduction

Implemented against `d0602656`, following the playback audit. These changes remove repeated preparation and decoding without lowering preview resolution, cursor/camera cadence or shutter quality.

## Changes

- Video consumers distinguish unopened and exhausted iterators. The host retains the last transferred image while the source holds it; EOF no longer reopens decoding on every display tick. Two queued frames remain the upper bound. Overdue samples are discarded while catching up, future frames wait for their timestamps, and backward/large source jumps or explicit resets reopen the iterator. Bitmap copies completing after cancellation are closed before entering the queue.
- Cursor placement for following keyboard captions runs only when an active caption needs it. Ordinary frames, text captions, fixed keyboard captions and disabled/future captions skip that work.
- Composition scene resolvers prepare group membership and root indexes once. Animated group values still update every frame, while individual rendering/shutter passes reuse the hierarchy. Direct graph callers build a fresh index rather than caching mutable input by identity.
- The desktop prepares the canonical camera and cursor center once per frame. Selection geometry and the completed-frame painter consume those same samples and players. Exposure endpoints keep their original timestamps, and glass renders reuse the center at their own raster density. Prepared resources are borrowed synchronously within one render. The main preview also loads images through a dedicated scope instead of constructing an unused media painter.

No capture protocol, saved project schema, native window behavior or translation string changes were needed.

## Measurements

Actual baseline and current functions were bundled into the same Node 24.19.0/V8 process on Linux. Scene timings are medians of seven batches of 50 calls after 30 warmups, with a no-op Canvas2D target and one visible clip. Index construction is excluded from the retained painting path. These are isolated CPU costs, not completed GPU work or whole-editor FPS; garbage collection and other host activity can affect them.

| Scene hierarchy | Before, per pass | After, per pass |
|---|---:|---:|
| 100 groups | 0.058 ms | 0.010 ms |
| 1,000 groups | 0.870 ms | 0.059 ms |
| 5,000 groups | 5.026 ms | 0.190 ms |

In the simulated single-final-frame case, one second of ticks opened 60/120/144 iterators at the corresponding display frequencies before the fix, versus one iterator and one converted bitmap afterward. A separate Chromium check encodes a real WebM/VP8 file with one ten-second frame, decodes it through the actual playback asset/sink/queue path, and verifies one opening, one bitmap and one presentation across 240 supplied timestamps spaced at 1/120 second. This verifies the lifecycle behavior; it is not a decoder throughput benchmark.

[Raw measurements and verification data](data/playback-improvements-2026-10-17.json) include coverage for every changed implementation file. No original user project was modified.

## Verification

- 533 focused Vitest cases pass in 30 files. Aggregate coverage of the changed implementations is 96.95% statements, 92.42% branches, 93.58% functions and 97.95% lines, retaining the configured 90% gate.
- Sequential queue cases cover 24–120 fps sources, 24–240 Hz ticks, 0.5×/1×/4× playback, EOF with queued future frames, empty media, backward/large jumps, resets and asynchronous bitmap cancellation. Queue ownership remains bounded and every created bitmap is closed once.
- Scene tests preserve order, nested groups, isolation, animated values and index invalidation after edits. Desktop integration tests exercise real selection, transform/crop gestures, consecutive manual focus adjustments and caption editing with the shared preview preparation.
- Five headless Chromium cases pass on Linux with SwiftShader: the real decode lifecycle above and exact completed-image comparisons for flat, animated-group, orbit-with-blur and 3D-cursor scenes. Each image case compares three 320 × 180 frames (691,200 RGBA channels) with zero differences between prepared/indexed rendering and ordinary evaluation/direct graphs. Both painters start with equivalent GPU resource lifetimes so one cannot borrow the other's quantized cursor raster upgrades.
- The 21 existing CLI preview/export comparison cases are also validated. Nineteen passed in the first run; two exceeded the default five-second deadline while software rendering and global type checks ran concurrently, then passed their unchanged pixel assertions on a focused rerun with a 30-second deadline.
- Global Vue/TypeScript, engine/runtime package type checks, renderer build, scoped lint/format and package boundary/file-size checks pass. Build-info and test artifacts stay outside the repository.

Native Windows/macOS decoders and hardware GPU drivers were not exercised on this Linux host. No Rust changes or repository-wide test run were needed, and no GitHub Actions were started.
