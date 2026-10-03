# Timeline scroll and playback updates

The timeline uses one viewport-sized bitmap inside a zero-height native sticky frame. Chromium retains its coverage during compositor scrolling, without waiting for JavaScript to reposition the canvas. Scroll events publish offsets immediately; Vue mounts the next virtual window before the shared measurement/paint frame. Logical document width and height never determine bitmap allocation.

Visible clip/zoom windows retain their array identity until membership or records change. Playback therefore moves the playhead through `translate3d` while unchanged artwork remains painted. Explicit compositor hints are limited to the viewport bitmap and playhead; offscreen clips have no mounted controls or layers. Timeline CSS translations use `translate3d`; static widths, layout positions and Canvas2D drawing coordinates retain their separate roles.

## Measured workload

The real Chromium test mounts the actual Vue timeline with a 1,000 × 300 CSS-pixel host. It supplies only the desktop preferences service; document data, virtualization, controls and painters are real. One workload has 10,000 consecutive one-second color clips in one track, a 10,000-second document and 10,000% timeline zoom. Sixty playback updates remain within the initial viewport.

| Measurement | Before | After |
| --- | ---: | ---: |
| Static canvas repaints for 60 playhead updates | 60 | 0 |
| Median Vue update duration | 2.5 ms | 1.1 ms |
| p95 Vue update duration | 7.0 ms | 2.5 ms |

Durations measure the interval from changing the playhead time to Vue's completed update. They exclude asynchronous decode, video rendering, GPU completion and frame presentation, and vary with the machine and load. These numbers do not establish application playback FPS. The test uses the explicit displayless Chromium software WebGL backend, not a verified hardware GPU stack.

A second 10,000-clip workload has 200 tracks with 50 clips each. Large jumps in both axes keep canvas bounds covering the viewport immediately; new visible tracks have painted pixels in the first animation frame. Semantic controls remain below 250. This checks a previous transient blank-frame regression as well as horizontal and vertical coverage.

Chromium's LayerTree reports compositor layers for the bitmap and playhead with the `WillChangeTransform` reason. The one-track workload reports 112 layers, with the bitmap bounded by the visible dimensions. A 3D transform permits composition; it does not remove the work of painting newly visible artwork, loading thumbnails, decoding media or rendering simultaneous effects.

## Reproduction

```sh
BEAM_HEADLESS_TEST=1 bunx vitest run \
  apps/desktop/src/components/editor/timeline/tests/timeline-surface.integration.test.ts \
  --silent=false
```

Chromium must be installed for the CLI backend. Focused unit/component checks additionally cover window identity, replacement documents, pinned/focused clips, selection geometry, playhead placement, scrubbing, zoom and trim/move interactions.
