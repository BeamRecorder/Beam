# FigmaDemo cursor rendering and software export

Flat cursors now retain a complete premultiplied GPU raster, including the shadow. A cache hit draws all original shutter positions in one instanced draw. Previously, each position repainted the shadow and cursor, then accumulated the complete result: up to 48 draw calls for 16 samples. The new path preserves normalized additive blending, shutter positions, weights and output resolution. It avoids CPU readback for accumulation.

The raster cache holds at most eight entries and 4 MiB. Larger valid rasters are transient and released after drawing. Stable supersampling bands prevent a new raster for every fractional zoom value; linear filtering preserves the retained image when it shrinks. Artwork, geometry, hotspot, shadow and resolution changes invalidate the corresponding entry. The existing source-artwork cache remains bounded at eight entries and 16 MiB. Both preview and export use this renderer.

Flat source artwork no longer builds an unused extruded silhouette or reads its alpha back from the GPU. Switching to 3D builds the volume lazily without downgrading an already sharper source raster. The 3D exposure algorithm is retained; its shader attribute locations are now resolved once per program.

## Workload and measurement

The private FigmaDemo project was copied before profiling; its original files were not edited. Its 13.973-second composition includes a 3072 × 1862 H.264 recording, a 640 × 480 webcam, split clips, captions, a blurred image background, a screen shadow, a smoothed macOS cursor and automatic 2D zooms. The cursor is 45 px with a 6 px shadow and motion blur intensity 0.4.

Measurements use Linux on an Intel Core Ultra 5 125H (18 logical CPUs), headless Chrome 154.0.8037.57, ANGLE SwiftShader, software decoding and software AVC encoding. Export output is 1920 × 1080 at 30 fps, AVC variable bitrate targeting 8 Mbps, with no audio. Audio mixing, desktop worker IPC and destination-file writes are outside the measurement. Timed export includes decoding, rendering, encoding and MP4 finalization; asset/font setup is recorded separately. Both versions use CPU profiling and fresh browser profiles.

Cursor hover analysis was prepared once from the actual recording and injected identically in both versions. Its preparation took approximately 50.5 seconds on this busy host and is excluded from these timings. This change does not optimize that analysis. Browser bundles are frozen for the before/after comparisons. The baseline is commit `370008c7`; subsequent native test-only commits do not change its renderer.

The preview measurement calls the actual `createRuntimePreview` with decoded project frames and a 960 × 540 canvas. It renders 120 frames at 60 fps timestamps without pacing, audio or an encoder. A one-pixel copy fences completed rendering. These times measure the rendering workload, not interactive playback FPS.

## Results

The final full-timeline comparison renders all 420 frames, including MP4 finalization. Before: **350.80 seconds**. After: **286.64 seconds**. This saves **64.15 seconds / 18.3%** in this local pair. Both exports contain 420 encoded packets and use the same encoder selection. FFprobe decodes all 420 frames in each file at 1920 × 1080; their durations match. The final MP4 comparison has SSIM 0.999951. The frame interval is 0–419 at 30 fps timestamps, covering the full 13.973-second composition.

### Earlier excerpt measurements

| Workload | Before | After | Less elapsed time |
| --- | ---: | ---: | ---: |
| Export, first 60 frames / 2 seconds | 97.36 s | 84.87 s | 12.8% |
| Preview, 120 completed frames | 98.50 s | 84.35 s | 14.4% |
| Preview frame submission | 6.00 s | 3.75 s | 37.4% |

These single-pair excerpt measurements precede the final attribute-cache refinement. The host also runs other desktop workloads; contention and cache state make individual wall-clock measurements noisy. Submission and encoder-backpressure stages can include waiting for pending software GPU work. They are not isolated CPU or codec costs. Completed end-to-end time is the primary comparison. Native Windows/macOS hardware performance has not been measured.

Raw measurements and frozen-bundle SHA-256 values are in [the measurement data](data/figma-export-2026-10-16.json). The private source recording is deliberately not committed. Local harnesses, frozen bundles, MP4s and CPU profiles are retained in `/tmp/beam-figma-profile-20261016`.

## Validation

119 focused unit tests pass with 99.81% statement, 99.55% branch, 100% function and 100% line coverage for the tested renderer modules. They cover fractional motion, 1,000-frame cache reuse, entry/byte eviction, transient textures, resolution/device boundaries, invalid and overflowing inputs, allocation failures, shader failures, context loss and disposal. Root, runtime and CLI type checks, scoped lint/format checks and package boundary checks pass.

The real Chromium comparison checks the new renderer against the original GPU path with 16 weighted shutter samples, fractional coordinates, several resolution bands, resize artwork, shadows, partial alpha, a transparent hole, an asymmetric orientation marker and interleaved GPU renders. Pixel comparisons use premultiplied RGBA and a 5% relative-error ceiling. All 18 cases pass: maximum alpha-energy error is 1.62% and maximum premultiplied pixel error is 4.997%. The original nine real-GPU exposure and volume checks also pass.

A Canvas 2D accumulation experiment was rejected: it increased cursor opacity by about 24% despite a full-frame SSIM above 0.9997. Whole-frame similarity alone was insufficient to validate this optimization; retaining GPU additive blending is intentional.

## Focused checks

```bash
bunx vitest run packages/runtime/src/cursor/flat-cursor-exposure.test.ts packages/runtime/src/cursor/cursor-raster-bounds.test.ts packages/runtime/src/cursor/cursor-gpu-painter.test.ts packages/runtime/src/cursor/cursor-volume-mesh.test.ts packages/runtime/src/rendering/cursor-gpu-render.test.ts
BEAM_HEADLESS_TEST=1 BEAM_CHROMIUM_GPU=software BEAM_CHROMIUM_VIDEO_DECODE=software bunx vitest run apps/cli/src/cursor-volume.integration.test.ts
bun run --filter @beam/runtime typecheck
bun run --filter @beam/cli typecheck
node scripts/check-package-boundaries.mjs
```
