# Quick Snip — Work in Progress

## Purpose

Quick Snip is a ShareX-style recording workflow for Beam. It is designed to start from a single configurable global shortcut or the system tray, let the user adjust a screen region while configuring the capture from a compact Crop Bar, and automatically finalize the result.

This document describes the implementation currently present on the `feat/quick-snip` branch. The feature is intentionally marked as work in progress: the core workflow is wired and covered by focused tests, but several platform and export paths still require production work and native validation.

## Implemented workflow

The main Electron process owns a central state machine:

```text
idle -> selecting -> preparing -> recording -> finalizing -> processing
                                                        -> completed
                                                        -> failed
                                                        -> canceled
```

The single `quickSnip.toggle` command behaves according to the current state:

- `idle` or a terminal state opens Quick Snip and restores the last region.
- `selecting` confirms the current region and starts without a countdown.
- `preparing` cancels startup.
- `recording` stops the recorder.
- `finalizing` or `processing` restores the status window.

The Crop Bar Start/Stop button uses this same toggle path. Normal Beam recording and Quick Snip recording are mutually exclusive.

## Shortcut, single-instance behavior, and tray

- `quickSnip.toggle` defaults to `Alt+Shift+S` and is exposed in shortcut preferences.
- GNOME/Wayland uses Beam-owned GSettings media-key entries when available.
- Development shortcut launches retain `BEAM_DEVELOPMENT_INSTANCE=1`, so the command reaches the existing development instance instead of starting a second Beam profile.
- Electron single-instance forwarding recognizes `--beam-shortcut=<id>` and dispatches the shortcut to the running process.
- Quick Snip is the first tray action and its label follows the active state.
- Tray icon lookup now uses dedicated platform candidates, validates that the icon is readable, and normalizes the Linux icon to 24×24.
- Tray labels are present in every current locale.

On GNOME, a visible tray icon still depends on the desktop providing StatusNotifierItem/AppIndicator support.

## Region selection and Crop Bar

- The existing full-screen region overlay is reused.
- Quick Snip hides the legacy selection toolbar; the region is drawn, moved, and resized directly.
- Live normalized region updates reposition the Crop Bar underneath the selection, or above it when required.
- The selected region is persisted in preferences and clamped to the available display on later launches.
- The Crop Bar is a dedicated transparent, frameless, always-on-top `BrowserWindow`.
- During selection it is an owned child of the selection overlay, keeping it above the overlay and clickable. It is detached before the overlay is hidden for recording.
- The Crop Bar has a WebKit drag handle and remembers a user-dragged position for the current session.
- Mode, preset, and format use native HTML selects. They do not create renderer popovers or resize the native window.
- The preset field immediately falls back to `Default`, including while preset storage is loading.
- Controls include Studio/Raw mode, preset, MP4/WebM override, automatic zoom, microphone, system audio, Studio camera, Start/Stop, Cancel, and the recorder-derived elapsed time.
- Crop Bar actions use native `title` attributes instead of custom tooltip popovers.

On Linux, the Crop Bar is hidden during recording when it cannot be placed outside the captured region. This is required because Wayland portals do not guarantee exclusion of an overlapping application window. Stop remains available through the global shortcut and tray.

## Editor presets

### Storage

- Presets are stored in the versioned `editor-presets.json` document under the Beam user data tree.
- Writes use a temporary file plus rename and retain a `.bak` fallback.
- Invalid documents are normalized and missing active presets fall back to the protected `Default` preset.
- Existing editor defaults, device settings, and export settings are used to initialize `Default`.
- Named presets clone `Default`.

### Editor UI

- The Video Editor top bar contains a single preset component.
- Its popover contains selection and all CRUD actions.
- New and Save are visually separated from Rename and Delete.
- New/Rename use the reusable `TextInputDialog`.
- Delete uses the reusable `ConfirmDialog`.
- Dialog actions place Cancel on the left and the primary/destructive action on the right.
- Opening a dialog closes the preset popover so it cannot render above the modal blur.
- Named presets show a dirty state and require Save.
- `Default` is protected from rename/delete and auto-saves editor defaults.
- Loading a non-fresh project preserves its stored editor state instead of applying the active preset over it.

Quick Snip source changes update the active preset immediately, including named presets, as requested by the capture workflow.

## Capture and manifest boundaries

- Capture requests carry `excludedWindowHandles` across the Electron/Rust boundary.
- macOS ScreenCaptureKit resolves those handles and excludes matching windows from display capture.
- Zoom elements now have an `enabled` property that migrates to `true`.
- Disabled zooms remain stored but are ignored by zoom playback and export evaluation.
- The Rust project manifest stores the Electron-owned editor state as opaque JSON, preventing Rust round-trips from dropping unknown editor fields.
- The normal recorder rejects startup while Quick Snip is active, while requests from the Quick Snip Crop Bar remain authorized.

## Studio and Raw processing

### Studio

- Uses the normal persistent Beam project root.
- Captures cursor/interactions and can include the configured camera and audio sources.
- Applies reusable editor preset fields to the project editor state during finalization.
- Automatic zoom OFF preserves generated zoom elements while marking them disabled.
- Produces collision-safe output under `<Videos>/Beam/user/quick-snip/studio/`.
- The completed Studio status can open the retained project in the editor.

### Raw

- Uses `<Videos>/Beam/user/quick-snip/.work/` as its technical capture root.
- Disables Beam cursor reconstruction, interactions, zoom, and camera.
- Produces collision-safe output under `<Videos>/Beam/user/quick-snip/raw/`.
- Removes the technical work project after success, cancellation, or failure.
- Does not expose Open in Editor.

## Status window and clipboard

- Export/finalization status is a dedicated transparent always-on-top window pinned to the bottom-right of the capture display.
- It displays the mode, preset, real thumbnail when available, status, progress, output path, Cancel, Copy Again, and Studio Open in Editor.
- Compact mode is a progress-filled pill.
- Hover temporarily reveals full details with a compositor-backed `translate3d` animation; there is no persistent “Keep expanded” action.
- The full card is draggable, while action buttons are excluded from the drag region.
- Cancel destroys the status window and terminal-state guards prevent late recorder/export events from reopening it at 0%.
- Completed files use native file clipboard formats on macOS and Windows. Linux copies a file URI as an explicit fallback.

## Known gaps before release

The following items are not complete and should block removal of the WIP label:

1. **Studio composited export** — Studio currently copies the native screen MP4 and patches the retained project state afterward. It does not invoke the Beam renderer/export pipeline, so canvas, background, camera composition, cursor reconstruction, and automatic zoom are not baked into the produced video yet.
2. **WebM finalization** — the current finalizer rejects WebM and still needs the Beam renderer/export pipeline with a compatible video codec and Opus audio.
3. **Raw audio muxing** — the MP4 fast path currently copies the native screen segment. It does not yet inspect and mux separate microphone/system-audio tracks without re-encoding.
4. **Windows native exclusion** — excluded window handles cross the protocol boundary, but the Windows capture backend does not yet consume them. Overlap exclusion is only implemented in the macOS ScreenCaptureKit backend.
5. **Native exclusion QA** — macOS exclusion requires a real visual recording test with the Crop Bar intentionally overlapping the capture. Windows requires implementation first. Linux full-screen hide behavior requires Wayland/X11 manual checks.
6. **Preset asset materialization** — imported backgrounds and other project-local resources are not yet copied into a durable user library when saved into a preset.
7. **Unsaved-change decision UI** — New/Rename/Delete use Beam dialogs, but changing presets with dirty editor settings still uses the existing browser confirmation sequence instead of a single Save/Discard/Cancel Beam dialog.
8. **Export thumbnail coverage** — thumbnail generation currently depends on a directly accessible file URL and may fall back to the mode badge for other session URL forms.
9. **Cross-platform native clipboard QA** — native file paste must still be verified in Finder and Windows Explorer, with Linux URI fallback verified on supported desktops.
10. **End-to-end recorder QA** — elapsed-time rendering, source toggles, cancellation during startup, Studio project retention, Raw cleanup, and output duration need manual end-to-end recordings on each supported OS.

## Focused automated coverage

The branch includes targeted Node, Vitest, and Rust coverage for:

- preset normalization, migration, CRUD, protected Default, and atomic fallback;
- editor preset composable/UI behavior and reusable dialogs;
- Quick Snip state transitions, cancellation races, late events, and recording exclusion;
- Crop Bar controls, native selects, Default fallback, timer formatting, drag/ownership, and placement;
- region overlay clamping, live updates, cancellation, and native-window ownership;
- finalizer naming, partial cleanup, Raw work cleanup, cancellation, and preset application;
- status placement, compact mode, hover details, actions, and terminal cleanup;
- tray ordering, state labels, Linux icon handling, and development profile behavior;
- Linux GNOME shortcut registration and single-instance forwarding;
- opaque editor manifest preservation and zoom `enabled` migration.

## Manual verification checklist

- [ ] Start the already-running development build with `Alt+Shift+S`; confirm that no second Beam process/window opens.
- [ ] Draw and resize a region while using every Crop Bar control; confirm that the overlay does not steal Crop Bar clicks.
- [ ] Start and stop using both the same shortcut and the Crop Bar button.
- [ ] Confirm that elapsed time remains visible whenever the Crop Bar can stay outside the Linux capture region.
- [ ] Confirm that Linux hides the Crop Bar before the first frame when overlap is unavoidable.
- [ ] Verify tray presence and Quick Snip state labels on each supported desktop shell.
- [ ] Verify macOS Crop Bar exclusion with intentional overlap.
- [ ] Verify Studio MP4 output, project retention, disabled zoom behavior, status actions, and clipboard paste.
- [ ] Verify Raw MP4 output and complete `.work` cleanup.
- [ ] Complete and verify every known gap above before declaring the feature release-ready.
