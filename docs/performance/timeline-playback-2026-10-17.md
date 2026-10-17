# Timeline and playback preparation

Audio buffer iterators now open only when a clip enters the existing one-second scheduling horizon. Future clips retain descriptors; EOF iterators are not polled again. Tests with 1,000 clips starting after one minute verify zero buffer openings at playback start, one opening at the exact lookahead boundary, unchanged source trims/rates/fades, pause/seek cleanup and rejection of a late decoded buffer.

Cached scrub candidate selection reuses the playback interval index instead of scanning the full composition. Its seconds clock preserves cut rounding; active images and disabled clips do not require decoded video coverage. Existing cache ownership, source offsets, freeze frames, shared aliases, preview quality, exact final seeks and generation cancellation retain their contracts.

Timeline playback follow retains measured ruler/viewport geometry relative to the scroll content. Ordinary ticks read only the current scroll position. Layout, root UI scaling, resize, duration and zoom changes refresh it in the shared measurement phase. Loaded media topology fingerprints are captured by value per playback engine; the next composition is always checked freshly. Audio resource lookup uses a Map, including initial audio loading, removing the per-resource asset scan.

## Measurements

The baseline is commit `15758838`. Frozen baseline functions and current functions run in the same Bun 1.4.2 process on Linux, using synthetic documents. Medians use seven batches after three warmups. Index construction and initial loaded-fingerprint capture are excluded because they are retained setup work. Result equality is checked with an actual cached-frame hit. These measure preparation functions, not decoding, completed rendering or interactive playback FPS. Host contention and garbage collection affect elapsed times.

| Workload, plain document | Before | After |
| --- | ---: | ---: |
| Cached scrub candidate/cache lookup, 10,000 clips | 0.468 ms | 0.002 ms |
| Two video compatibility checks, 10,000 clips | 6.018 ms | 2.456 ms |
| Audio topology, 1,000 distinct assets | 6.818 ms | 0.264 ms |

Reactive-document measurements and every recorded workload are retained in [the raw results](data/timeline-playback-2026-10-17.json). They are separate observations; the differences do not establish whole-application speedups. No original project files are edited. Native Windows/macOS playback has not been measured.

Focused component tests count zero playback-follow DOM measurements across 240 ticks inside the current viewport. Real Chromium checks retain the existing no-artwork-repaint and immediate diagonal-scroll coverage cases, and exercise playback follow after repeated CSS UI-scale, resize and timeline zoom changes. The tests preserve the recorded media/cursor/camera frame cadence; no FPS cap or quality reduction is introduced.

## Verification

The focused coverage run passes 189 tests, followed by a separate 10-case cached-scrub run including a new shared-bitmap alias regression. Coverage of the changed runtime/viewport implementations is 97.20% statements, 93.96% branches, 97.56% functions and 98.50% lines, with every tested module above 90% in all four measures. Three real Chromium cases pass. Root/runtime type checks, the desktop/CLI build, scoped lint/format and package boundaries pass. Rust capture and native windows are unchanged.

```sh
bunx vitest run packages/runtime/src/playback/tests/audio-scheduler.test.ts packages/runtime/src/playback/tests/playback-composition-topology.test.ts packages/runtime/src/playback/tests/media-playback-cached-seek.test.ts packages/runtime/src/playback/tests/playback-clip-index.test.ts
BEAM_HEADLESS_TEST=1 bunx vitest run apps/desktop/src/components/editor/timeline/tests/timeline-surface.integration.test.ts -t 'moves the playhead without repainting|keeps playback follow aligned|keeps canvas coverage'
```
