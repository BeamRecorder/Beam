# Screenshot copy and export measurements

The Screenshot result toast offers **Copy timing report**. It copies JSON for that exact operation, including success/failure, output dimensions and format, byte count, cache hit and elapsed milliseconds. The editor console also prints `[Beam Screenshot copy]` or `[Beam Screenshot export]` and a timing table. Cancelling the save dialog is reported as cancelled and shows no completion toast.

- `snapshot`, `save`, `encoding`: renderer snapshot, document persistence and complete encoding request. Saving and encoding run in parallel.
- `cacheLookup`, `cacheHit`: lookup cost and whether an existing encoded image was reused. Cache hits have no new worker rendering measurements.
- `decorations`, `workerRoundTrip`: preparation of cursors/watermarks and worker startup, message transport, loading, rendering and encoding together.
- `worker.fonts`, `worker.images`, `worker.render`, `worker.thumbnail`, `worker.encode`, `worker.bytes`, `worker.cleanup`, `worker.total`: worker resource loading, shared painter, bounded output thumbnail, PNG/WebP encoding, buffer extraction and cleanup. Font and image loading overlap.
- `publishRoundTrip`: the complete native IPC publication request. `native.validate`, `native.pngDecode`, `native.clipboardWrite`, `native.saveDialog`, `native.fileWrite`, `native.total` provide its native breakdown. Clipboard completion is awaited; file completion follows the atomic rename. Native failures also log their partial timings in the Electron terminal.

`totalMs` measures wall-clock completion in the editor. Parent stages include their children, and parallel stages overlap: **do not sum the rows**. Each process uses its own monotonic clock and transfers durations, rather than subtracting timestamps across processes. Save-dialog time includes the person's response. Failed operations retain completed and failed-phase durations; missing phases were not completed/measured. Reports contain no image bytes or source URLs.

The encoded-result cache remains local to one editor and bounded to 16 MiB. Thumbnail generation reuses the full-resolution output in the worker; clipboard publication does not wait for a second renderer decode. A thumbnail failure is logged and does not prevent copying or saving the actual image.

## Screenshot project thumbnails

Project cards use a separate 480 × 270 maximum WebP render of the current composition. Edits are coalesced for one second, deferred while interacting or copying/exporting, and rendered in an independent worker. The original document dimensions and typography remain unchanged. Leaving through editor navigation flushes the latest thumbnail. Closing the renderer cancels pending work.

The host writes `thumbnail.webp` atomically only if the saved document’s SHA-256 state hash still matches the rendered snapshot. Both catalogue paths use that file, watch replacements and include its file timestamp in the URL to invalidate browser caches. Projects without an edited thumbnail keep their original capture until opened and rendered.

## Screenshot opening measurements

Opening a screenshot emits one JSON report tagged `[Beam media:screenshot-load]` in the renderer console and the development terminal. It includes `module`, `document`, `backgroundLibrary`, `presets`, `state`, `history`, `sourceImage`, `layerImages`, `fonts`, optional background/watermark/cursor phases, `assets` and `firstRender`. `layer.<kind>:<id>` measures each visible layer during that first render, including its compositing, effects and perspective; it is a completed painter duration, not a standalone GPU timer. `totalMs` starts when the renderer receives the project context and ends after the first composed canvas frame; native window creation, Vite server startup and physical display presentation are outside this clock. Module/data and asset phases overlap, so do not sum them. The report includes layer/image/history counts and preview resolution, without project content or filesystem paths. Superseded requests cannot overwrite a newer report.

The preview resource watcher only reloads when resource identities change; placement, opacity and an unrelated cursor-library response reuse the prepared assets. Disabled image/font layers are skipped, imported font requests overlap and Composition thumbnails wait for the first preview.

## Resources shared between editors

One editor window owns background/cursor catalogues and separate Screenshot/Video preset catalogues. Concurrent requests share one IPC read, editors receive independent copies, and native library changes invalidate the retained catalogue even while its editor is unmounted. Preset writes and change events update the shared catalogue without overwriting an active dirty draft.

Screenshot and Video previews share a decoded-image cache, including backgrounds, imported images and the watermark logo. Public asset URLs are normalized before lookup; project media retain their project-specific URLs. The cache retains at most 64 URLs and 16,777,216 decoded pixels (approximately 64 MiB of RGBA), with least-recently-used eviction. Failed decodes are retried, obsolete completions cannot replace a newer request, and dropping a cache entry never blanks pixels borrowed by an active painter.

Direct project switches retain these resources until the editor window closes. Returning to the Recorder currently closes that native window and releases its caches and subscriptions. Document histories, video/audio decoders and GPU surfaces remain project-owned and are disposed on editor replacement. Export/thumbnail workers keep their independent resource lifecycle; this cache does not retain encoded output or rendered frames.
