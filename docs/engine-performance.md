# Engine metrics, sparse edits and retained GPU rectangles — 2026-10-01

This pass follows [native media/shadow work](gpu-rendering-performance.md).
[Raw measurements](performance/engine-2026-10-01.json) retain the frozen baseline,
hardware, warmed alternating pixel comparisons, real editor trials and limitations.
The later canvas/Gaussian migration must be measured separately.

## Implemented

The generic `packages/runtime/src/performance/` collector is independent of Vue and the
decoder/renderer/export implementations. Bounded rings report medians/p95 and
lifetime counters; workers validate snapshots. Decode, load, seek, prepare,
render, gesture, copy/paste, encoder waits, GPU upload, submission and hardware
execution are separate stages. Overlapping stages must not be summed into
frame time. Disabled collection creates no idle sampling loop.

Scrubbing seeks the preceding encoded keyframe while moving, then requests an
exact frame on release or after 120 ms quiet. Generation cancellation rejects
obsolete work; playback/export retain exact source mappings. Gesture previews
borrow unchanged immutable clips and retain sparse timing patches. Save,
history and canvas observers no longer deep-traverse each incoming document.

Eligible runs of at least 4,096 opaque pixel-aligned rectangle commands use
retained GPU instancing in preview/export. Unsupported shapes and native video
remain ordered paint barriers; there is no reduced-resolution preview or hidden
layer/frame skipping. Renderer scopes release their primary and scratch resources.

## Evidence, not universal speedup claims

Twelve warmed alternating 1920 × 1080 trials include completed RGBA readback.
Filled 10,000 rectangles improved 119.4 → 41.1 ms; outlined rectangles
141.7 → 45.0 ms; two 4,096-command runs interleaved with real video/native effects
97.1 → 23.5 ms. Those comparisons are bit-exact. Fractional shapes remain native
and show no completed-image gain. The full-GPU video prototype was slower
(10.3 → 14.7 ms for 128 instances) and was not admitted into product rendering.

Real Soft Signal opened in 908 ms and settled in 2.02 s in the retained trial.
Six seconds of playback still had 43.8/104.4 ms median/p95 animation-frame gaps;
this is not smooth realtime playback. Forty exact seeks had no failures, with
370.4/664.9 ms median/p95. Of 120 scrub requests, 119 were superseded and one
presented before exact refinement; cancellation counts are not playback FPS.

Its complete 465-frame, 1080p30 AVC/AAC export took 44.53 s: rendering 7.37 s,
decode 0.29 s and software encoder waits 35.54 s. The earlier comparison that
overlapped another decode was excluded. No robust overall export improvement
is established. A verified proof is saved separately in `Vidéos/Beam-performance`;
the user's original project was never overwritten.

The 10,013-clip timeline retained at most 13 rows/32 controls while scrolling.
Sparse drag reduced its measured 30-update wall time from 1.74 to 1.04 s in an
intermediate trial, but scrolling and first-paste timing worsened in that trial.
Those single trials do not establish an overall clipboard/timeline speedup.
See [timeline measurements](timeline-stress-performance.md) for the earlier pass.

## Verification

Focused TypeScript tests, at least 90% coverage in every required category,
application Vue typechecking and a temporary production build passed for this
pass. Native validation ran in private Electron/Mutter/XWayland instances with
copied projects. Other desktop apps remained open; OS caches were not cleared.
No Windows/macOS hardware validation was performed. Later changes require their
own focused checks and pixel/performance measurements.
