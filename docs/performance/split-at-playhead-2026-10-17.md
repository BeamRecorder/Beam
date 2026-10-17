# Split at playhead: performance audit

Audited at `dcc4e071` on Linux, 2026-10-17. This report changes no application behavior.

Implementation follow-up: [changes, measurements and regression checks](split-at-playhead-improvements-2026-10-17.md).

## Main findings

### 1. A video split reloads media even when the sources are unchanged

`videoPlaybackTopology()` includes every moving clip's ID. Splitting adds an ID, so `canRetimeComposition()` rejects the resulting composition. `MediaPlaybackEngine.loadComposition()` pauses, closes cached frames, enters `loading`, and posts `load` instead of `retime`. The worker then disposes all loaded video inputs and opens/probes them again before seeking. This also affects deletion of a moving clip.

An assertion-based diagnostic exercised the actual engine with a fake worker/audio service and a screen clip derived from FigmaDemo. Its media URL was replaced in memory with an inert test URL; no recording was decoded or modified. After splitting, the diagnostic confirmed:

- Assets remained identical.
- Worker messages were `pause`, `load`, `seek`, with no `retime`.
- State changed to `loading`, then `paused`.
- The previously cached bitmap was closed.

The worker's existing `retime()` implementation can create consumers for new clip IDs using already loaded assets. Investigate a compatibility contract based on loaded media and valid clip-to-asset bindings. Preserve source-change detection, generation cancellation, shared-frame ownership and exact cut-boundary behavior. Do not simply remove topology validation.

Sources: [topology](../../packages/runtime/src/playback/playback-composition-topology.ts), [engine](../../packages/runtime/src/playback/media-playback-engine.ts), [worker](../../packages/runtime/src/playback/playback.worker.ts).

### 2. Rebuilding linked names repeats the recording graph calculation per visible clip

Each composition replacement recreates the timeline's name resolver. Its cache prevents duplicate requests for the same ID within that document, but the first lookup for each visible clip calls `recordingLinkedClipIds()` separately. That function resolves owners for every clip; owner resolution repeatedly filters the full clip list and searches screen candidates. Both visual and audio timeline lanes request these names while rendering.

With three recorded lanes and explicit recording links, resolving just 24 visible screen clips took approximately 49 ms with 300 total clips, 657 ms with 1,500 clips, and 3.19 s with 3,000 clips. These costs occur synchronously in renderer-side code. This is the strongest measured CPU bottleneck in this audit.

Build recording ownership/group connectivity once per immutable composition and reuse it across queries. Keep explicit links, older split associations, detached sidecars and session boundaries correct.

Sources: [name resolver](../../apps/desktop/src/components/editor/timeline/timeline-linked-clips.ts), [recording links](../../packages/engine/src/composition/recording-media-links.ts), [visual lane](../../apps/desktop/src/components/editor/timeline/TimelineCanvasClips.vue), [audio lanes](../../apps/desktop/src/components/editor/timeline/TimelineAudioTracks.vue).

### 3. Lock preservation becomes quadratic and is checked twice

`preservesLockedItems()` compares every locked item with every surviving original item to preserve relative layer order. The composition command checks it, and the desktop's `useLockedState` setter checks it again. Its fast path is cheap when there are no locks; many locks make ordinary edits expensive.

A separate valid-edit benchmark locked only webcam clips after the first recording group, leaving the group being split unlocked. It executed the real split command and asserted lock preservation. One standalone lock check took approximately 35 ms for 1,500 clips/499 locks and 115 ms for 3,000 clips/999 locks. Do not add these timings to other benchmark rows as if they came from a single end-to-end recording.

Investigate an indexed layer-order check and one authoritative validation boundary without weakening the desktop's protection for other mutation paths.

Sources: [lock validation](../../packages/engine/src/composition/timeline-locks.ts), [command boundary](../../packages/engine/src/commands/composition-commands.ts), [desktop state](../../apps/desktop/src/components/editor/composables/useLockedState.ts).

### 4. The history watcher still deeply traverses immutable composition data

The workspace history watches `composition` with `deep: true`, even though it is a shallow state replaced by edits. Deferring the snapshot by 300 ms does not defer this traversal. A direct Vue watcher comparison on the larger fixtures measured approximately 3–7 ms for deep watching versus less than 0.03 ms for identity watching. The project-save watcher already uses identity watching.

Use identity watching for composition changes while retaining deep observation of mutable presentation/zoom controls. Verify split, trim, undo/redo and caption edit grouping.

Source: [workspace history](../../apps/desktop/src/components/editor/workspace/useEditorWorkspaceHistory.ts).

### 5. Full JSON copies can cause a second pause after the cut

Autosave clones the full composition on the renderer thread after 250 ms. History serializes/parses a complete snapshot after 300 ms. The timers coalesce edits, but the work remains synchronous. At 1,500 clips, isolated history recording took about 15 ms and a composition JSON clone about 17 ms; at 3,000 clips they each took about 25–26 ms. Additional presentation data, IPC and storage are not included.

Reuse immutable composition ownership in history while copying mutable presentation fields. Review snapshot capture and serialization at the save boundary without allowing later edits to mutate an earlier queued save. Keep save-on-close and failure handling intact.

Sources: [history engine](../../packages/engine/src/history/snapshot-history.ts), [project snapshots](../../apps/desktop/src/components/editor/composables/useProjectEditorState.ts).

## Additional candidate: waveform cancellation is global

Changing the waveform request set increments a shared generation and sends `clear` to every waveform worker, including for unrelated visible clips. Completed source bins can be reused across splits, so this does not mean all audio is always decoded again. Nevertheless, unfinished unrelated extraction is cancelled and may be restarted. This deserves a targeted in-flight extraction test before changing scheduling; no end-to-end timing was measured for it here.

Source: [waveform reconciliation](../../apps/desktop/src/components/editor/timeline/composables/useCompositionAudioWaveforms.ts).

## Measurements and limits

The real FigmaDemo project was read only. The pure split command took approximately 0.09 ms for its 10 clips; this excludes watchers, rendering, decoding and storage. Its video topology still changed after the split, proving that the reload issue also applies to small projects.

Synthetic fixtures contain one session, three assets, and consecutive groups of screen, webcam and microphone clips. Source ranges, grouping, tracks and explicit recording links are valid. A split inside the first group creates three right-hand fragments. Linked-name measurements resolve 24 pre-existing screen clips through a fresh document resolver. History measurement includes composition only, so it excludes the rest of an editor snapshot. Lock measurements use a separate fixture with unlocked split targets.

Timings use the actual functions bundled for Node 24.19.0/V8, with one warm-up and the median of five batches. Synchronous helpers use three iterations per batch; linked names use one. Vue comparisons include assignment and `nextTick()`, with watcher setup excluded. These are local diagnostic timings, not Electron interaction latency, frame rate, hardware-decoder measurements or cross-platform guarantees. JIT and garbage collection can affect short samples. The largest fixtures are stress cases, not a description of FigmaDemo.

Raw observations: [data](data/split-at-playhead-2026-10-17.json). The initial exploratory lock timings used unsuitable targets and were discarded; only the separately validated lock measurements are retained.

No product code, project files or persisted settings were changed. No changelog entry is needed for this audit. No full test suite, native platform test, GitHub Action or publish was run.
