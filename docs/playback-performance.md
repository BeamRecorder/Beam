# Vivid Pixel playback measurements — 2026-09-13

Baseline: `447b4219`. The comparison uses production Vite builds of the complete video editor, Electron 43.4.1, MediaBunny 1.50.9 and the actual Vivid Pixel recording: AV1, 1920 × 1052, approximately 12 seconds, variable frame rate. Both audio tracks, the Safari frame, background blur, watermark, cursor and two automatic zooms remain enabled. Preview quality remains `full`. The 755 recorded cursor points are unchanged.

## Isolation and measurement

- A temporary copy of the project and media is loaded through the real project store and `project-media` range handler. Preference/preset/window IPC is supplied by the benchmark wrapper; saves remain in the fixture. The background URL is remapped to the same bundled wallpaper on the benchmark origin. SHA-256 checks of all 15 original project files pass after the runs.
- A private headless Mutter compositor and D-Bus session host an ordinary 1440 × 1000 Electron window. No window appears on the user's desktop. No screenshots, image comparisons or visual tests are used. Offscreen readback was excluded from the final comparison because it introduces extra work absent from the normal editor.
- Chromium reports accelerated canvas, compositing, rasterization and video decoding. CPU time is the sum of process user/system ticks for this Electron instance (browser, renderer including workers, GPU process and utilities). It is CPU seconds, not wall time or a percentage of the entire machine.
- GPU rendering time comes from the Intel driver's `drm-engine-render` counter, deduplicated by DRM client. GPU-process CPU is included only in the CPU totals. Video-engine counters sometimes reset when decoder clients close, so no percentage reduction in hardware video-decoder time is claimed.
- RSS is sampled every 200 ms and summed across the Electron processes. It includes shared mappings and is not a measurement of unique physical RAM or VRAM.
- Each window settles for eight seconds after readiness. Two final baseline runs and two final optimized runs use identical scenarios, with no build or test run alongside them. Earlier diagnostic runs, including one disturbed by a concurrent compilation and one CPU-profiler run, are excluded. The machine remains shared; small differences should not be treated as guarantees.

## Results

Resource values are the mean of the two runs. Latencies are the median across their 240 commands.

| Scenario / measurement | Before | After |
| --- | ---: | ---: |
| 10 seconds of playback: total CPU | 9.28 s | 7.96 s |
| Playback: renderer/worker CPU | 4.71 s | 3.43 s |
| Playback: GPU rendering time | 2.85 s | 2.87 s |
| Playback: peak summed RSS | 968.9 MiB | 967.2 MiB |
| Wide scrub: total CPU | 7.11 s | 6.43 s |
| Wide scrub: GPU rendering time | 0.959 s | 0.893 s |
| Wide scrub: peak summed RSS | 992.4 MiB | 979.6 MiB |
| Nearby scrub: total CPU | 5.00 s | 2.05 s |
| Nearby scrub: GPU rendering time | 0.705 s | 0.609 s |
| Nearby scrub: peak summed RSS | 1003.1 MiB | 975.0 MiB |
| Nearby scrub: new decoded/transferred bitmaps | 83.5 | 9.5 |
| Nearby scrub: command settlement median | 33.6 ms | 1.7 ms |
| Nearby scrub: commands presented without supersession | 5 / 240 | 220 / 240 |

The wide scrub requests 120 positions between seconds 1 and 9, forward and backward, at 30 requests/second. The nearby scrub requests 120 positions within a 158 ms region around second 4 at 60 requests/second. Both end with a normal exact seek to second 4. Command settlement includes superseded requests and is **not** a measurement of time until pixels reach a physical display. Superseded requests can still provide intermediate preview frames, so the last row is not a displayed-frame count.

Total playback CPU decreased by 14%, while playback GPU time and memory were effectively unchanged. Nearby scrubbing used 59% less CPU, 14% less GPU rendering time and about 28 MiB less peak summed RSS. The nearby region fits the existing frame cache; these larger gains do not apply to arbitrary uncached jumps across a long recording.

Both tracks decoded and scheduled in all final playback runs, with no playback exceptions or audio scheduling errors. The baseline reported zero late audio buffers; each optimized run reported two buffers up to 42.7 ms late. An earlier optimized run reported zero. No audio-latency improvement is claimed; these shared-machine, muted-output measurements do not replace listening or hardware validation.

## Changes

1. Automatic zoom smoothing now finds the beginning of its history window with binary search. It visits only preceding points within the same 600 ms window, preserving the original summation order and interpolation. The evaluator snapshots numeric telemetry once instead of repeatedly reading Vue proxies. An independent copy of the previous algorithm verifies exact numerical equivalence at boundaries and duplicate timestamps.
2. Paused scrubs reuse a cached frame only when its source-time interval covers the request for every active video layer, at the current preview quality. Missing layers, gaps and future frames still decode. Static images, playback rate and freeze frames are handled explicitly. The final seek and scrubs during playback retain the audio/worker path.
3. A cached scrub cancels queued older seeks and prevents their in-flight bitmaps from replacing the chosen frame. Decode ownership and closing are tested across that race.
4. Sequential worker queues and iterators are released after clips leave the active/preload window and before arbitrary seeks, including scrubs served entirely from cache. Cleanup waits for in-flight decoding. The 120 ms lookahead and active overlapping layers remain intact. In Vivid Pixel, this releases two queued 1920 × 1052 RGBA bitmaps (15.4 MiB), in addition to ending sequential decoder prefetch. The renderer's 64 MiB cache budget is unchanged.
5. Errors from an obsolete playback tick retain that tick's generation, so a late failure cannot invalidate a more recent successful scrub.

## Validation

255 targeted tests in 16 files pass, covering playback, audio scheduling, zooms, frame ownership, cancellation and the editor adapters. Coverage is restricted to the seven affected playback/zoom implementation modules: 94.96% statements, 91.73% branches, 99.26% functions and 98.40% lines. No repository-wide test or coverage run was used.

TypeScript and Vue type checking pass. The project picker's existing search input reference now has an explicit exposed-input type, resolving its two plain TypeScript errors without changing focus behavior. Production Vite builds and changed-file formatting checks pass. Changed-file lint succeeds with the existing `no-useless-spread` warning in worker shutdown. A final headless run of the cleanup/race fixes completes playback and both scrub scenarios with no renderer or playback errors; its log is `/tmp/beam-playback-verified.log` and it is not included in the comparison table.

## Reproduction artifacts

The local measurement scripts are `/tmp/beam-vivid-fixture.cjs`, `/tmp/beam-playback-build.mjs` and `/tmp/beam-playback-measure.cjs`. Run the Electron measurement only through `/home/albi/Documents/Projects/rust-ui/argui/scripts/linux-hidden-display.sh`, with `BEAM_BENCH_BUILD` selecting the production build and `BEAM_BENCH_RUNS=2`. Raw final logs are `/tmp/beam-playback-{before,after}-final.log`; aggregated values are in `/tmp/beam-playback-summary.json`. These temporary artifacts depend on this machine and its private project copy.

Windows and macOS hardware playback was not measured. The changes use shared TypeScript and browser media APIs; no platform-specific capture code or media encoding settings changed.
