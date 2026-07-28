# Unified clip composition

The editor has one composition model and one mutation pipeline. Recording tracks, imported media, audio, webcam, screen capture and captions are all represented as clips.

## Canonical state

```ts
interface ClipComposition {
  schemaVersion: 1
  assets: MediaAsset[]
  clips: Clip[]
}
```

A `MediaAsset` describes an immutable source. A `Clip` describes how a source is used on the timeline:

- `timelineStartMs` and `timelineDurationMs` place it in the edit.
- `sourceInMs` and `sourceDurationMs` select source media.
- `playbackRate` maps timeline time to source time.
- `enabled` controls playback and rendering.
- `order` controls visual stacking and timeline order.
- `groupId` links synchronized sidecars such as screen, webcam, system audio and microphone.

The clip union contains `screen`, `video`, `image`, `webcam`, `audio` and `caption`. There is no separate base-video model, media-layer model, webcam composition, audio timeline or caption layer.

## Single mutation pipeline

`composition/engine/clip-engine.ts` owns every composition mutation:

- add and delete;
- move, trim and split;
- playback speed;
- enable/disable;
- link and detach;
- visual order;
- transform, crop, appearance and mirroring;
- audio volume.

The engine is pure: each operation receives a composition and returns a validated composition. Components do not mutate clip timing independently.

Grouped clips share timeline start, duration and playback rate. Operations that change timing apply to the whole group until a clip is detached. Splitting a group creates a new linked group for the right-hand side.

## Recording lifecycle

1. Capture sessions remain immutable source files.
2. `session-clips.ts` materializes valid session tracks as canonical assets and clips.
3. Existing clips are never overwritten during synchronization, so edits survive reloads.
4. Canvas preview, timeline, audio playback, captions and export all read the same composition.
5. The complete editor state is saved atomically with composition, zooms and presentation settings.

Imported videos with audio create a linked visual clip and audio clip. Imported images, videos and audio use the same engine operations as recording clips.

## Playback and export

`sourceTimeAt()` is the only timeline-to-source mapping. Preview and export use it for screen video, secondary videos, webcam and audio.

The visual stack is derived from active visual clips and `order`. Audio is mixed from active audio clips. Captions are active caption clips. Export does not maintain a second composition representation.

## Persistence

Projects persist one editor state:

```ts
interface ProjectEditorState {
  schemaVersion: 2
  composition: ClipComposition
  zoom: ProjectZoomState
  presentation: ProjectEditorPresentation
}
```

Runtime URLs are materialized when state is read and are not persisted. Project media files are removed when no canonical clip references them.

## Breaking change

This refactor intentionally does not migrate the previous layer/base-video schemas. A noncanonical composition is discarded and rebuilt from recording sources. There are no compatibility adapters or legacy write paths.

## Removed systems

- separate composition store and composition IPC CRUD;
- `ProjectComposition` and layer types;
- base-video state;
- webcam composition adapter;
- visual-stack adapter;
- separate session audio player;
- timeline layer adapter and parallel waveform pipeline;
- standalone zoom persistence;
- legacy composition handoff documentation and tests.

## Invariants

- Clip IDs and asset IDs are unique.
- Every non-caption clip references an existing asset.
- Timeline/source duration obeys `timelineDurationMs = sourceDurationMs / playbackRate`.
- Playback rate is between `0.25x` and `4x`.
- Clip duration is at least 40 ms.
- Linked clips have identical timeline timing and playback rate.
- Project assets have safe project-local file names.
- Session assets resolve only inside the referenced capture session.
