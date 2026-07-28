# Unified clip composition engine

The editor UX is a compatibility contract. The current timeline, tracks, playhead, hover-to-add zoom and caption affordances, trim handles, media property panels, canvas interactions and export flow remain unchanged. Only their state and execution model is replaced.

`ClipComposition` schema version 2 is the single editable scene. It owns immutable media assets and every screen, webcam, imported visual, audio and caption clip. Non-destructive trim is bounded by `sourceRangeStartMs` and `sourceRangeEndMs`; all move, trim, split, speed, enable, transform, crop, appearance, volume, link and detach operations run through the pure clip engine.

Timeline, decoded waveforms, canvas preview, cursor placement, zoom playback, audio playback, captions, undo/redo, atomic persistence and export consume the same composition. There is no migration or legacy adapter for the previous parallel layer, base-video, sidecar or audio models.
