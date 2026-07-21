# Composition Engine UI Handoff

## What is ready

`src/components/video-editor/composition/engine/` is an isolated, pure TypeScript engine. It owns clip timing, split, trims, custom playback rates (`0.25×–4×`), move, visual transform, enable/delete, linked recording sidecars, detachment/reattachment, and migration from the legacy layer model.

It has no Vue, Electron, canvas, player, export, filesystem, or UI dependency. Its unit tests live in `tests/composition/clip-engine.test.ts`.

## UI integration contract

- Store and render the returned `ClipComposition`; do not mutate clips in place.
- Use `activeClipsAt(composition, timelineTimeMs)` to determine what is visible at a timeline instant.
- Use `sourceTimeAt(clip, timelineTimeMs)` for every video, audio, webcam, cursor and annotation lookup.
- Call the engine operation corresponding to each UI command, then persist the returned composition.
- A linked group propagates move, trim, split and speed changes. Call `detachClip` before applying an operation only to one sidecar. Use `attachClip` to relink a compatible sidecar.

## Required UI work

- Timeline: render clips by `timelineStartMs` / `timelineDurationMs`; provide selection, drag, trim handles, split-at-playhead, speed input/presets, enable and delete.
- Inspector: expose custom speed constrained to `0.25–4`, source/timeline timing, group state and a detach/reattach action.
- Canvas: apply `transformClip` only to visual clips; audio clips intentionally reject visual transforms.
- Player/export: evaluate source time through `sourceTimeAt`. Audio must use pitch-preserving time-stretch; changing `HTMLMediaElement.playbackRate` alone is insufficient for export parity.
- Webcam: keep it outside the screen zoom transform and use the applied spring scale with the webcam layout engine.

## Persistence integration

Migrate legacy `ProjectComposition` data once using `migrateLegacyComposition`. Persist the v2 `ClipComposition` under a versioned editor field. Validate with `validateComposition` at the Electron boundary before writing. Keep legacy readers until all stored projects have migrated.
