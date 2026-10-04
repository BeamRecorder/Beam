# CLI export comparison — 2026-10-03

The CLI exports the saved `4kexport` render snapshot through WebCodecs or experimental FFmpeg VA-API without opening the editor. Chromium supplies Beam's common rendering in both paths; the FFmpeg path transfers the completed Electron GPU texture through DMA-BUF and converts it to NV12 on the GPU.

## Workload and method

One imported AVC High 4K video, no audio, 22.033 seconds. Output is **1920 × 1080, 30 fps, 661 frames**, medium preset, target 5.90976 Mbps VBR. The saved background, blur, clip appearance/shadow and watermark are retained. The project and source media are unchanged; portable requests resolve their local resources explicitly. This is the single-video project, not the 10,000-shape stress test or a 4K output benchmark.

Linux/X11, Intel Core Ultra 5 125H / integrated Arc (i915), Intel media driver 26.1.5, FFmpeg 8.1.3. FFmpeg uses Electron 44.5.1 / Chromium 152.0.7977.130; the independent WebCodecs host uses Chrome 152.0.7977.54. Three sequential runs per format/backend, alternating which backend runs first. No compilation, test suite or other agent export runs concurrently; existing user applications remain open. Startup, muxing, publication and shutdown are included in full CLI wall time, while the pipeline timer covers frame processing only.

Chrome's accelerated decoder failed on this source with both Chrome 152 and 154. The measured WebCodecs runs retain requested hardware rendering but disable accelerated decoding with `--disable-accelerated-video-decode`. WebCodecs selected software AVC/VP9 encoding; FFmpeg confirmed `h264_vaapi`/`vp9_vaapi` and direct DMA-BUF import. Thus these are complete backend comparisons with different decoder/encoder implementations and Chromium hosts, not isolated encoder benchmarks or evidence that hardware WebCodecs is always slower.

## Results

| Container | Backend | Video pipeline trials (s) | Median pipeline (s) | Median CLI wall time (s) | Median frames/s |
| --- | --- | --- | --- | --- | --- |
| MP4 | FFmpeg VA-API | 15.137 / 37.225 / 33.495 | 33.495 | 35.746 | 19.73 |
| MP4 | WebCodecs software AVC | 18.400 / 27.344 / 26.144 | 26.144 | 38.301 | 25.28 |
| WebM | FFmpeg VA-API | 33.830 / 16.279 / 17.030 | 17.030 | 18.622 | 38.81 |
| WebM | WebCodecs software VP9 | 52.102 / 29.633 / 36.846 | 36.846 | 50.370 | 17.94 |

FFmpeg's median full CLI time is 6.7% lower for MP4 and 63.0% lower for WebM (2.70× full-job throughput). Its MP4 video pipeline is nevertheless 28.1% slower at the median. Trial variation is substantial, so a single fast export would overstate the result. These measurements establish neither a universal speedup nor a guaranteed improvement over earlier desktop reports taken under different conditions.

For the native WebM median, rendering takes 0.581 s and backpressure 15.362 s. Native import/conversion measures 1.270 s and native encode/mux 0.775 s at their respective medians. Capture, presentation, texture delivery, synchronization and host IPC remain involved; backpressure is not solely codec execution. Native timers include setup and flush and are not additive pipeline stages. No native encoder utilization percentage is inferred from these numbers.

## Paired delivery experiments

The isolated CLI host now disables the display frame-rate limiter. Three paired WebM trials with the original serial transport measured median pipeline time of 30.681 s with the limiter and 28.256 s without it (7.9% lower); the first pair was slower without the limiter. This is a modest, variable scheduling improvement. The desktop process retains its global scheduling settings.

The next candidate retained up to three GPU textures, overlapped native submission with preparation of the following frame, and reduced presentation from two animation-frame boundaries to one. A frozen compiled control retained the isolated-host flag, serial acknowledgement and two boundaries. Three pairs per format alternated execution order:

| Container | Version | Pipeline trials (s) | Median pipeline (s) | Median full CLI time (s) |
| --- | --- | --- | --- | --- |
| WebM | Serial control | 33.835 / 37.084 / 35.161 | 35.161 | 37.588 |
| WebM | Queue candidate | 28.551 / 32.487 / 28.418 | 28.551 | 30.863 |
| MP4 | Serial control | 32.295 / 17.190 / 16.767 | 17.190 | 18.656 |
| MP4 | Queue candidate | 28.308 / 28.560 / 13.922 | 28.308 | 30.588 |

WebM improved in all three pairs and its median pipeline time fell 18.8%. MP4 improved in two pairs, but its overall median became worse as the runs shifted between faster and slower capture rates. This does not establish a reliable MP4 speedup for that candidate.

The final implementation also removes the separate preparation IPC and redundant capture stop. Capture starts paused; the single frame IPC waits for queue capacity and resumes capture after presentation. Queue waits therefore fall inside the existing backpressure timer, and final draining is included before publication. The following fresh comparison was performed later, with the same frozen serial control and the final compiled implementation; it must be compared within this series rather than against the earlier series:

| Container | Version | Pipeline trials (s) | Median pipeline (s) | Median full CLI time (s) | Median frames/s |
| --- | --- | --- | --- | --- | --- |
| MP4 | Serial control | 14.122 / 12.839 / 13.034 | 13.034 | 13.711 | 50.71 |
| MP4 | Final queue + one IPC | 12.779 / 11.482 / 11.343 | 11.482 | 12.419 | 57.57 |
| WebM | Serial control | 21.546 / 12.831 / 13.714 | 13.714 | 14.277 | 48.20 |
| WebM | Final queue + one IPC | 19.475 / 19.484 / 13.840 | 19.475 | 20.517 | 33.94 |

MP4 improved in all three final pairs: 11.9% less median pipeline time and 9.4% less full CLI time. WebM became 42.0% slower in median pipeline time and 43.7% slower in full CLI time in this series, despite the earlier candidate's improvement. Three trials and the substantial change in capture timings do not isolate a cause or establish a consistent WebM gain. **No global export speedup is demonstrated.** These results retain the same frame count, resolution and bitrate target; no frames or visual effects are removed to improve timing.

In the final MP4 runs, median CPU render submission was 0.390 s, texture capture wait 10.116 s and native encode/mux 0.506 s. For final WebM they were 0.975 s, 16.253 s and 1.192 s respectively. The queue retained one to three textures at peak, depending on the run. Capture and native transfer overlap, so their accumulated timers are not additive. The measurements point to Chromium texture delivery as the main remaining wait; they cannot establish the native encoder's utilization percentage. Moving decoding or encoding into the preview alone would not eliminate the compositor delivery used by this exporter.

## Reproduction and artifacts

Build the CLI and native exporter before timing. Supply a complete portable request with the settings above:

```sh
bun run build:ffmpeg-export
bun run build:cli
node apps/cli/dist/index.mjs export request-webm.json native.webm --backend ffmpeg-vaapi
BEAM_CHROMIUM_GPU=hardware BEAM_CHROMIUM_VIDEO_DECODE=software \
  BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome \
  node apps/cli/dist/index.mjs export request-webm.json browser.webm --backend webcodecs
```

The measured browser trials used a local executable wrapper to apply the same decoder switch before the dedicated environment setting was added. They used the compiled CLI/browser bundles. Runtime metrics are available at `diagnostics.runtime` in current CLI results; the initial experimental measurement artifacts contain the native runtime metrics directly under `diagnostics`.

Local artifacts are retained under `~/.cache/beam-4kexport-comparison-2026-10-03/`: portable MP4/WebM requests, preparation/benchmark scripts, twelve videos, per-run JSON/stderr and `results.json` containing wall time, request hashes and ffprobe results. Every measured file has 1920 × 1080 output at 30 fps and 661 video packets. The separate real-GPU regression checks ordered and identical frames, decoded colors, MP4/AAC, WebM/Opus, 4K output, decoded 4K sources, 1080p60 and cancellation.

Delivery experiments add `delivery-probe.json`, `pipeline-comparison.json` and `final-comparison.json`, their scripts, per-run JSON/logs and 30 videos. `baseline-cli/` retains the compiled serial control; `queue-cli/` retains the intermediate candidate. `video-validation.json` records ffprobe checks, and `bundle-hashes.json` identifies the control and final compiled bundles. First/middle/last decoded frames are retained for both containers and versions. An additional installed-runtime smoke test reuses Electron in Node mode, dispatches the fixed packaged GPU host without desktop startup, and exports 661 hardware frames. A real SIGINT smoke test interrupts an active native job, preserves the unpublished destination, removes staging and terminates its live process group.

All 43 completed comparison/smoke files passed the geometry and 661-packet checks. The nominal frame rate is 30 fps; average MP4 frame rate differs slightly because the final frame preserves the requested 22.033-second endpoint. The six first/middle/last decoded-frame comparisons between the final control and candidate yielded SSIM 1.0. These are sampled equality checks, supplemented by the regression's frame-by-frame color/order checks; they do not prove whole-project pixel equality for arbitrary documents.

See [setup and host boundaries](../dev/ffmpeg-gpu-export.md) for prerequisites and display requirements. Windows/macOS native GPU transfer and hardware encoding are not implemented by this Linux experiment.
