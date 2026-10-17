# Split at playhead improvements

Implemented after the [split audit](split-at-playhead-2026-10-17.md), against baseline `956ecf83`.

## Changes

- Video splits reuse open media inputs when required asset identities, kinds and URLs remain unchanged. The worker creates the new consumers through its existing retiming path. Existing clip IDs cannot change assets through that path. Audio retains its independent resource compatibility check. Source changes still reload; removing the last use of a video asset also changes the resource set and reloads.
- Retiming keeps surviving clips' cached frames and releases removed clips' pixels. This prevents stale source pixels when a removed ID is reused for another asset. Vue invalidates borrowed frame references before either update path; generation checks still reject obsolete frames and asynchronous completions.
- An engine recording-link index prepares session, screen and group lookups once. Connected components share one document-ordered member list. Timeline labels query those lists, while the existing selection-expansion API retains its insertion ordering. Move gestures and recording synchronization also share ownership lookups across their clip queries. Indexes are explicit document snapshots, not caches keyed by mutable object identity.
- Lock validation sorts surviving layer orders into buckets, preserves ties at each protected layer, and checks the earlier/later order bounds. Both command and desktop state boundaries still validate locks. Unlocked layers can reorder on the same side of a protected layer, and absent orders keep their existing behavior.
- Workspace history observes composition replacement without deep traversal. Owned snapshots freeze and share composition records, copy mutable controls separately, and restore editable control copies during undo/redo. Unchanged document replacements still coalesce: comparisons borrow unchanged records and serialize only replaced records/metadata when checking equality. Autosave retains the immutable composition while capturing its own presentation state before entering the write queue.

No recording format, project schema, export quality, translation strings or native capture behavior changed. The audit's waveform-generation cancellation candidate is outside this change; its worker scheduling needs separate measurements.

## Measured preparation costs

Actual implementations were bundled together for Node 24.19.0/V8 on Linux. Baseline source is taken from Git, including the original recording-link functions. Comparisons use the same fixture contents, with baseline timings collected before ownership freezing and new timings after ownership is established. Fixtures contain consecutive linked screen/webcam/microphone groups and three shared assets. The name query creates a fresh resolver for 24 visible screen clips, including index construction. A separate valid lock edit leaves the split group unlocked and locks the later webcam clips. Assertions verify name equality and both lock validators accepting the edit.

Each entry is the median of five batches following one warm-up. Name batches have one iteration; other synchronous helpers have three. Initialization and initial ownership freezing are outside history/save capture timing. JIT, garbage collection and host activity can affect short samples; these results describe preparation functions rather than end-to-end interaction latency.

| Isolated operation | Clips | Before | After |
|---|---:|---:|---:|
| Resolve 24 visible clips' linked names | 300 | 46.24 ms | 0.33 ms |
| Resolve 24 visible clips' linked names | 1,500 | 734.01 ms | 4.39 ms |
| Preserve layer order, 99 locks | 300 | 1.66 ms | 0.16 ms |
| Preserve layer order, 499 locks | 1,500 | 59.11 ms | 0.76 ms |
| Record alternating split/document history | 300 | 1.81 ms | 0.021 ms |
| Record alternating split/document history | 1,500 | 17.28 ms | 0.014 ms |

Capturing an already owned 1,500-clip composition for a save changed from a 19.33 ms JSON copy to retaining the frozen document reference. The measured latter operation was below 0.001 ms. This excludes presentation capture, IPC structured cloning, main-process serialization, file writes, and initial freezing; it is **not** a claim that saving a whole project takes less than 0.001 ms.

An assertion-based trace of the actual playback engine with fake worker/audio services changes from `pause → load → seek` to `pause → retime → seek`. The existing bitmap remains open before retiming readiness, state never enters `loading`, and audio composition loading is called only for the initial load. Worker regression tests verify that retiming retains loaded inputs and creates/removes consumers without reopening sources. No decoder speedup or platform-specific media latency is inferred from fake services.

Raw observations and traces: [JSON](data/split-at-playhead-improvements-2026-10-17.json).

## Regression coverage

Focused tests cover successive cuts, exact source offsets at the cut, deletion and undo, reused clip IDs across assets, shared frame ownership, late frames, source changes, queued save ownership, failed writes, pending project loads, mutable restored controls, no-op history commits, and load/caption editing guards.

Deterministic stress cases compare lock results with the original pairwise rule across 10,000 edits and non-finite/undefined order boundaries, protect 10,000 layers with bounded order reads, and build a 12,000-node recording graph containing an ownership cycle without recursion. They test algorithmic behavior, not long-duration hardware recording.

Verification passed: 317 targeted cases in 24 files, including worker and desktop integration tests. Each of the 15 changed implementation modules exceeds 90% statements, branches, functions and lines. Aggregate coverage is 97.63% statements, 94.67% branches, 97.97% functions and 98.49% lines. Cleanup and fixture refinements were then rerun in their affected test files.

The global Vue/TypeScript check (with its build-info cache outside the repository), engine and runtime package type checks, the Vite renderer build, scoped lint/format checks, package boundaries and diff whitespace checks passed. Native Windows/macOS playback and actual decoder latency were not measured on this Linux host. No Rust change or native capture test was needed; no full repository test suite or GitHub Action was run.
