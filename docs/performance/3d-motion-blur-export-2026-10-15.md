# 3D shadows and software motion-blur export

The shared preview/export renderer now accumulates premultiplied shutter samples linearly. Repeated source-over compositing previously darkened transparent shadows as the adaptive shutter switched between one, three and five poses. A Chromium regression reproduced maximum channel differences of 57 and 79 for an otherwise identical image. The corrected path is checked against a three-byte tolerance, including camera-dependent webcam painting.

The orbit framing safety inset also fades with camera strength. Its previous fixed 0.5% inset produced a final size jump when an almost-flat camera became flat. Continuity tests cover all eight presets down to a strength of 0.0000001.

For orbit scenes without camera-dependent webcam layout, all shutter poses share one full scene raster and texture upload. WebGL projects every original pose with its original weight, accumulates them additively, and transfers the completed exposure once. Webcam scenes retain per-pose painting with isolated additive accumulation. Disabled cursors no longer trigger an empty perspective projection. Resolution, frame count, shutter duration and sample selection are preserved.

## Measured workload

- Linux, Intel Core Ultra 5 125H, 18 logical CPUs, approximately 31 GiB RAM.
- Headless Chrome 154.0.8037.57, ANGLE SwiftShader and software AVC encoding.
- Real 3072 × 1862 H.264 source: `examples/website-studio-loop/assets/screen-recording.mp4`, source interval 2–6 seconds.
- Output: 1280 × 720, 30 fps, four seconds / 120 frames, no audio, AVC variable bitrate targeting 4 Mbps, quality latency, MP4 muxing.
- Safari frame, 32 px bottom shadow, automatic Dynamic camera at 1.5×, camera motion blur intensity 0.8.
- Cursor variant: bundled macOS artwork, 3D cursor and cursor motion blur intensity 0.8, with a deterministic movement trace.

The benchmark calls the production asset loader, video renderer, camera/cursor evaluators, encoder selector and Mediabunny canvas encoder. It includes validation/setup, decoding, completed rendering/encoding and mux finalization. It uses an in-memory mux target; desktop worker IPC, destination-file writes, export previews and audio are outside this measurement. MP4 saving happens after the timed pipeline. Each invocation uses a fresh Chromium profile. CPU profiling is enabled in both versions.

## Results

| Workload | Before | After | Less elapsed time |
| --- | ---: | ---: | ---: |
| Camera blur, pair 1 | 119.58 s | 51.87 s | 56.6% |
| Camera blur, pair 2 | 139.16 s | 63.06 s | 54.7% |
| Camera blur, median of two pairs | 129.37 s | 57.46 s | 55.6% |
| Camera blur + 3D cursor blur, one pair | 151.54 s | 69.68 s | 54.0% |

A single 2D control took 61.39 seconds before and 62.75 seconds after (+2.2%). This does not establish a 2D export speedup; the demonstrated gain is for the 3D camera path.

These are observations on this workload and a shared desktop machine, not a platform-wide speed guarantee. An initial unbundled sanity run took 106.91 seconds; it is excluded from the paired table. The paired runs replay frozen before/after browser bundles. Raw stages, output sizes, encoder selections and bundle hashes are in [the measurements](data/3d-motion-blur-export-2026-10-15.json).

The saved after MP4s were checked with FFprobe: H.264, 1280 × 720, 30 fps, four seconds and 120 decoded frames. The cursor comparison also counted 120 encoded packets in both versions. Shadow opacity intentionally differs from the faulty baseline; output bytes are not expected to match.

Do not interpret `encoderBackpressureMs` as isolated codec time: pending software WebGL work and canvas readback can complete during `CanvasSource.add()`. With the 3D cursor enabled, GPU synchronization shifts much of that wait into the render stage instead. The encoder implementation was not changed.

## Validation

183 focused Vitest checks and 34 real Chromium rendering checks pass. The latter cover soft shadow opacity with/without webcam, a CPU reference for moving premultiplied exposures, small-number detail, complete source edges and preview/export parity. The exposure reference permits at most four premultiplied byte levels of rounding error. Targeted coverage exceeds 98% for statements/branches/lines and is 100% for functions. Root/package type checks, scoped formatting/lint, package boundaries and production file sizes pass. The Unreleased changelog records both fixes and the export change.

## Reproduction

```bash
bun scripts/performance/profile-camera-export.ts /tmp/beam-camera-profile after orbit 2
BEAM_PROFILE_CURSOR=1 bun scripts/performance/profile-camera-export.ts /tmp/beam-camera-profile after-cursor orbit 1
BEAM_PROFILE_BUNDLE=/absolute/path/to/frozen-before.js bun scripts/performance/profile-camera-export.ts /tmp/beam-camera-profile before orbit 2
```

The harness writes per-label JSON, CPU profiles, frozen bundles and MP4s. The task's original artifacts are in `/tmp/beam-3d-export-20261015`. Keep software backend settings and the source unchanged between comparisons, and run GPU workloads sequentially. Native Electron rendering and Windows/macOS performance were not measured here.
