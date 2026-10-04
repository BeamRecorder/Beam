# Screenshot loading: Beautiful Captures

Read-only measurements on the local saved composition, October 3, 2026. No editor was opened or driven for these measurements. The machine was also running other development processes; these values are descriptive, not a performance guarantee.

The document contains 22 composition layers, 9 imported images, 8 text/shape clips and one imported font. The 1,584,474-byte JSON contains 48 undo and 2 redo snapshots; approximately 1.56 MB belongs to history and 31 KB to the current state.

Twelve warm samples of each Node operation, preceded by one warm-up:

| Operation | Median | Maximum sample (p95 for this small sample) |
| --- | ---: | ---: |
| Read screenshot JSON | 14.33 ms | 32.57 ms |
| JSON parsing | 20.90 ms | 40.44 ms |
| Current-state validation | 0.64 ms | 4.79 ms |
| History validation | 33.37 ms | 41.00 ms |
| Complete screenshot store read | 48.56 ms | 91.81 ms |

These independent measurements overlap conceptually and should not be added. They exclude Electron IPC serialization, Vue initialization, image/font decoding, shader setup and canvas drawing. They therefore do not explain an observed multi-second opening by themselves.

The preview previously retained only three decoded image URLs and watched entire background/watermark/cursor-library objects. A cursor-library response could restart preparation even in this scene with no cursor layers, causing decoded resources to be requested again after eviction. The cache now retains a bounded set of recently used resources, the watcher follows actual resource identities and Composition thumbnail workers wait for the first complete preview. Imported font requests overlap, as do module compilation and metadata reads.

The next real opening emits `[Beam media:screenshot-load]` with overall renderer startup, module/data initialization, fonts/images, first rendering and per-layer durations. Compare the same scene and preview dimensions on cold and warm opens. Native window construction, Vite launch and physical display presentation remain outside the renderer clock. See [measurement reference](../screenshot-export-performance.md).
