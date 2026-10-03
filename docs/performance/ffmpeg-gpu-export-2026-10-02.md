# Linux GPU export delivery measurements — 2026-10-02

The experimental desktop exporter keeps video pixels on the GPU: Electron BGRA DMA-BUF → FFmpeg direct hardware import → VA-API NV12 conversion → H.264 hardware encoding. An asynchronous Node-API descriptor bridge replaces one subprocess per frame. Shared-texture compositor scheduling uses a 1000 Hz ceiling instead of 240 Hz; output frame rate remains unchanged.

## Workload and environment

Three sequential runs per implementation, same fixture and machine: 300 frames, 1920 × 1080, 30 fps, 10-second duration, MP4/H.264 VA-API, VBR 3 Mbps, no audio. Full-canvas colors change every 100 ms, providing both changing and identical frames. This measures frame delivery overhead on a light scene; it does not measure dense scene rendering or video decode cost.

Linux/X11, Intel Core Ultra 5 125H / integrated Arc (i915), Intel media driver 26.1.5, FFmpeg 8.1.3, Electron 44.5.1. Development renderer served by Vite on a dedicated port. Stage timers exclude the destination dialog and renderer startup. Existing development processes remained open. The first bridge-only trial overlapped a brief native transport test build; the other bridge trials and all baseline/final trials ran without compilation or test suites.

| Delivery implementation                             | Pipeline times, seconds | Median, seconds | Median frames/s |
| --------------------------------------------------- | ----------------------- | --------------- | --------------- |
| Sender subprocess per frame, capture ceiling 240 Hz | 7.771 / 6.965 / 6.808   | 6.965           | 43.07           |
| Async descriptor bridge, capture ceiling 240 Hz     | 5.396 / 5.463 / 5.492   | 5.463           | 54.91           |
| Async descriptor bridge, capture ceiling 1000 Hz    | 5.076 / 5.034 / 4.991   | 5.034           | 59.60           |

The final median is **27.7% less pipeline time**, or **1.38× throughput**, on this workload. Across final trials, Chromium presentation waits totaled 434–447 ms, native GPU import/conversion 503–514 ms, and native encode/mux 185–213 ms. Remaining delivery time includes offscreen compositor capture and host IPC. Native timers include setup and flush and are not additive pipeline stages.

## Correctness and limits

The Linux hardware regression decodes the completed test files to check every ordered and identical frame's color, first/last frames, frame count, duration, audio and 4K dimensions. A 120-frame 1080p60 case checks the faster scheduler at every frame boundary. A real encoded 4K video with changing colors checks ordered WebCodecs-decoded frames downscaled to 1080p; its fixture explicitly tags BT.709 on frames and the encoded stream. CPU decoding belongs to the test verifier; export does not read video pixels back to CPU.

The Node-API bridge is tested without a GPU for unsigned 64-bit modifier preservation, descriptor retention after the original fd closes, acknowledgement ordering, failure/disconnection cleanup and invalid metadata. FFmpeg remains a separate process to avoid Chromium codec symbol conflicts; the bridge has no FFmpeg linkage.

These results do not predict the time for an arbitrary imported 4K video, the 10,000-shape stress project, another GPU, driver, compositor or machine load. Chromium presentation/capture remains involved. Electron GPU counters exclude the standalone FFmpeg process, so they cannot establish encoder utilization or overall GPU saturation.
