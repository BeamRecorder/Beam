# Heavy timeline playback follow-up — 2026-09-13

This extends [the Vivid Pixel measurements](playback-performance.md). The baseline is commit `8b5a602c`. It keeps full-resolution preview, the same video effects, audio tracks, two-frame playback queue and 120 ms lookahead.

## What the heavier workload exposed

Each mounted video fragment previously owned two thumbnail workers, even when many fragments reused the same asset. They each opened the media and maintained an independent cache. This work competed with playback and scrubbing. In addition, visited playback clips retained their CanvasSink pools after their sequential queues were released. Those surfaces were outside the renderer's 64 MiB frame-cache budget.

Scene resolution also scanned the entire composition for each time query, including intermediate camera-simulation queries. Rendering looked up each video clip by scanning the composition again. Worker selection and queue metrics scanned all video consumers repeatedly.

The changes share thumbnail workers/cache by asset, coalesce visible and pending requests, stop thumbnail workers when their media leaves the viewport, index temporal/ID lookups, and release inactive playback surfaces. The source canvas pool now has one surface: the worker already transfers or copies each canvas into a separate owned bitmap before requesting the next. No source dimensions or rendering effects were reduced. Thumbnail refresh also follows clip movement/duration and asset-ID changes.

## Headless workload and measurements

The fixture reuses the real Vivid Pixel media in a temporary project copy. It contains 36 one-second groups, each with one screen fragment, two picture-in-picture video fragments and both audio tracks: **180 clips, 36 seconds, three simultaneous full-resolution videos**. Source slices repeat within the existing recording. A second fixture has 180 groups: **900 clips, three minutes**. These are constructed stress timelines, not claims about the contents of the user's project.

An ordinary 1440 × 1000 Electron window runs on a private headless Mutter display. No screenshots or visual tests are taken. The 14 original media/telemetry files match the saved SHA-256 hashes. The original project JSON is newer than the frozen fixture, with a modification time preceding these runs; the harness uses the isolated copy and does not write that original metadata. Measurement uses the production Vite build and actual MediaBunny/browser decoders, with accelerated Intel canvas/compositing/video decoding reported by Chromium. Audio remains decoded and scheduled, with output muted by the harness.

The comparison below uses the first valid baseline and the final implementation. Both settle for eight seconds after editor readiness, then measure idle, ten seconds of playback, 120 wide scrub commands between seconds 1 and 33 at 30 Hz, and 120 nearby scrub commands around second 4 at 60 Hz. Each scrub phase ends with an exact seek. Both runs complete without renderer/playback exceptions. There are no concurrent Beam builds or tests during these measured phases; the machine itself remains shared.

| Measurement | Before | After |
| --- | ---: | ---: |
| Editor readiness, 180-clip fixture | 7.01 s | 1.52 s |
| Peak summed RSS during post-load idle | 8,461.7 MiB | 1,031.2 MiB |
| Playback CPU, all Electron processes | 35.68 s | 25.61 s |
| Playback peak summed RSS | 4,075 MiB | 1,205 MiB |
| Playback GPU rendering time | 2.97 s | 3.27 s |
| Wide scrub CPU | 25.57 s | 19.71 s |
| Wide scrub peak summed RSS | 3,079 MiB | 1,239 MiB |
| Wide scrub GPU rendering time | 1.24 s | 1.15 s |
| Nearby scrub CPU | 13.47 s | 9.97 s |
| Nearby scrub peak summed RSS | 3,047 MiB | 1,196 MiB |

On this pair, playback CPU decreases by 28% and its peak summed RSS by 70%; wide scrub CPU decreases by 23%. This includes competition from thumbnail work after loading. It is a single pair, not a statistically established steady-state percentage. An earlier intermediate build measured 36%/26% CPU reductions, illustrating why these figures are workload measurements rather than guarantees. RSS sums shared mappings across processes and is not unique physical RAM or VRAM. CPU seconds sum user/system process ticks. GPU rendering time is the Intel driver's deduplicated `drm-engine-render` counter; video-decoder counters can reset and are not used for reduction claims. Playback presents more frame updates after the change; GPU rendering time does **not** consistently decrease.

A later baseline run with a 30-second settle hits `Decoder initialization failed, too many decoders in use.` Its timing comparison is excluded. The later optimized run completes without that error and uses roughly 1.1 GiB at its playback peak, but overlaps a short test run at the start of its measurement and unrelated native testing on this shared machine; its CPU figures are excluded too.

The original 900-clip run was stopped during loading while its renderer consumed more than 3 GiB and a CPU core continuously. The optimized 900-clip run reaches readiness in 3.23 seconds, completes playback and both scrub scenarios without exceptions, and peaks around 1.6 GiB during playback. There is no completed baseline for a percentage comparison at 900 clips. This stress case still reports late audio buffers (up to 281 ms), so these results do not establish perfectly smooth playback or audio under arbitrary load. Windows and macOS hardware playback were not measured.

## Validation

194 tests in 13 directly related files pass. Coverage for the 11 affected implementation modules is 96.27% statements, 91.07% branches, 97.79% functions and 99.00% lines. This includes randomized interval-oracle comparisons, stable layer ordering and floating-point cuts, retime/index invalidation, shared thumbnail ownership/pending requests, worker cancellation, disposal and asynchronous queue replacement. No repository-wide tests or coverage were run.

Vue and plain TypeScript checks, changed-file lint/formatting, and the production Vite build pass. The build retains the existing large-chunk advisory. The final headless implementation completes all three active scenarios without playback or renderer exceptions (`/tmp/beam-heavy-verified.log`). Its audio scheduler reports six late buffers, at most 85 ms, and no scheduling errors; no listening or audio-latency improvement is claimed. No native Rust code was changed, and no Windows/macOS hardware checks were available in this Linux run.

## Local reproduction artifacts

- `/tmp/beam-heavy-fixture.json` and `/tmp/beam-heavy-180-fixture.json` contain only temporary fixture metadata pointing to the copied media.
- `/tmp/beam-playback-build.mjs` exposes the existing player/engine to the measurement harness in temporary builds.
- `/tmp/beam-heavy-180-measure.cjs` and `/tmp/beam-heavy-measure.cjs` run the 180- and 900-clip scenarios. `/tmp/beam-heavy-steady-measure.cjs` changes the settle interval to 30 seconds.
- `/tmp/beam-heavy-180-before.log` and `/tmp/beam-heavy-verified.log` are the comparison above. `/tmp/beam-heavy-180-after.log` is the intermediate run. `/tmp/beam-heavy-900-after.log` is the larger stress validation. `/tmp/beam-heavy-steady-{before,after}.log` retain the excluded follow-up runs and their limitations.

Run the harness only through `/home/albi/Documents/Projects/rust-ui/argui/scripts/linux-hidden-display.sh`, selecting the build with `BEAM_BENCH_BUILD` and the fixture with `BEAM_BENCH_FIXTURE`. The logs and scripts are machine-local and depend on the private media copy.
