# Timeline clip trim responsiveness — 2026-10-17

The reported project is **Video for BeamMainPage**, with three clips (screen,
image and shape), two assets and a 22.726-second clip extent. Its saved JSON was
read without editing it. Baseline: `43741104`.

## Cause and change

Previously, a pointer event scheduled a standalone animation frame to publish
the trim preview. Vue then updated lane geometry and scheduled the shared
timeline bitmap's animation frame. A settled timeline therefore needed a second
frame to paint its new clip body. This introduces visible lag even in a small
project with negligible timing calculations.

Clip trim events now publish their geometry immediately. Vue updates the lane
before the next shared paint frame; multiple invalidations still produce one
bitmap paint. Autoscroll setup coalesces through Vue's next tick and uses the
latest pointer. Repeated snapped/clamped times retain their existing preview.

The engine prepares target/group membership, possible downstream ripple records,
stationary duration and sparse preview indexes once per gesture. Pointer updates
replace only affected records instead of rebuilding the clip array and comparing
each clip against a linear search through the original document. Start/end source
timing and transition normalization are shared with the final trim command.
Only pointer release commits; cancellation/disposal clears transient state.

## Measurements

Linux, Node v24.19.0; seven median batches after twenty warmups. The microbenchmark
measures timing/geometry preparation only: it excludes gesture initialization,
Vue, inspector materialization, media decoding and completed canvas painting.
The baseline includes its full preview, changed-ID comparisons and duration scan;
the new path includes its prepared sparse preview and duration result.

| Fixture | Edge | Baseline ms/update | Prepared ms/update |
| --- | --- | ---: | ---: |
| Actual project, 3 clips | Start | 0.002968 | 0.004750 |
| Actual project, 3 clips | End | 0.007863 | 0.001684 |
| Synthetic 1,000 clips | Start | 20.243832 | 0.004537 |
| Synthetic 1,000 clips | End | 23.303206 | 0.002427 |
| Synthetic 5,000 clips | Start | 543.332453 | 0.003384 |
| Synthetic 5,000 clips | End | 606.691688 | 0.002824 |

The actual project's calculations remain tiny; its start calculation is slightly
slower in this run. The useful latency correction there is the removed frame
gate, not a claimed whole-editor CPU speedup. Synthetic fixtures repeat the
project's image on independent stationary tracks alongside its screen clip.
They expose the old quadratic comparisons; they are not real dense projects or
end-to-end drag timings. Other consumers may materialize the full clip list.
See [raw measurements](data/timeline-trim-2026-10-17.json).

## Verification

Focused engine tests compare previews with validated commits through grouped
trims, playback rates, source boundaries, freeze frames, downstream companions,
ripple reversals, captions, duration floors and transition normalization. An
instrumented stationary clip verifies that repeated pointer previews do not
reread its timing.

Desktop tests exercise both handles, immediate geometry before any RAF flush,
one final commit, snapping, minimum duration, repeated limits, viewport clamps,
autoscroll, cancellation, replacement and disposal. A mounted Vue host uses the
real shared surface, lane and frame queue with an instrumented canvas painter.
With simulated 60/120/144/240 Hz clocks, current clip geometry reaches the painter
on the first frame; two pointer updates still produce one paint. These are
deterministic scheduling tests, not measurements on physical monitors.

The eight focused trim/timing-preview/clip-engine/timeline move and zoom-selection
test files pass: **120 cases**. Scoped coverage across all five changed
implementation modules is **98.97% statements, 97.05% branches, 100% functions
and 99.41% lines**; each module exceeds 90% on every metric. The new preview,
shared timing helper and trim interaction have 100% on every metric.

Additional checks: engine and renderer type checks, renderer Vite build, package
boundaries and scoped formatting/lint. No native capture
code, saved-project format or UI strings changed. Windows/macOS native execution
and manual Electron dragging were not performed in this verification.
