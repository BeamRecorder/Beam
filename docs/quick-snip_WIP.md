# Quick Snip — Work in Progress

## Purpose

Quick Snip is a ShareX-style recording workflow for Beam. It starts from a single configurable global shortcut or the system tray, uses a compact Crop Bar, and automatically finalizes the result. Windows/macOS capture an adjustable screen region; Linux captures a single window selected through the system Portal.

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

- `idle` or a terminal state opens Quick Snip and restores the last region on Windows/macOS.
- `selecting` starts without a countdown, confirming the screen region on Windows/macOS or opening the system window chooser on Linux.
- `preparing` cancels startup.
- `recording` stops the recorder.
- `finalizing` or `processing` restores the status window.

The Crop Bar buttons use explicit Start/Stop actions in the same state machine, so repeated clicks cannot turn a pending start into a cancel. Normal Beam recording and Quick Snip recording are mutually exclusive.

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

- Windows/macOS reuse the existing full-screen region overlay. Linux shows the Crop Bar alone and requests `portal:window` with no screen-region crop.
- Quick Snip hides the legacy selection toolbar; the region is drawn, moved, and resized directly.
- Live normalized region updates reposition the Crop Bar underneath the selection, or above it when required.
- The selected region is persisted in preferences and clamped to the available display on later launches.
- The Crop Bar is a dedicated transparent, frameless, always-on-top `BrowserWindow`.
- During selection it is an owned child of the selection overlay, attached before its first native presentation and raised when the overlay is shown or focused. It is detached before the overlay is hidden for recording.
- The Crop Bar waits for native readiness and a mounted-renderer handshake before receiving configuration and queued commands. A Start arriving during loading is retained; cancellation clears it. The recorder runs without background throttling.
- Linux acknowledges native Start only after its first usable video sample is queued after the format announcement. Empty, cursor-only, or dropped buffers cannot mark the session as recording. A missing first frame times out during startup; an immediate Stop after successful startup therefore cannot overtake the first frame in the encoder queue.
- The Crop Bar has a WebKit drag handle and remembers a user-dragged position for the current session.
- The `480 × 132` Crop Bar uses two compact rows with separators: a shared mode button group and a native preset selector above the mode-specific controls. The preset owns export format. They do not create renderer popovers or resize the native window.
- The preset field immediately falls back to `Default`, including while preset storage is loading.
- Controls include Studio/Screenshot/Instant mode, preset, automatic zoom, microphone, system audio, camera, Start/Stop, Cancel, and elapsed time. Screenshot hides video devices and zoom and offers Copy or Open in editor. Toggle buttons expose their active state, and labels, accessible names, default-preset display name, and native hints follow the application language.
- Crop Bar actions use native `title` attributes instead of custom tooltip popovers.
- Field icons and labels open their native select. Disabled sources and effects use red crossed-out icons; the controls remain clickable until recording preparation locks settings.
- During recording, the Crop Bar follows the shared Recorder visibility preference, including fade and hidden-until-hover modes. Selection stays fully visible. Linux shares its pre-recording system-audio level preview with the HUD, while each window releases only its own subscription.

On Linux, capturing one window keeps the separate Crop Bar out of the video. The bar stays available for Stop and Cancel, alongside the global shortcut and tray. Wayland controls its initial placement; an exact screen position cannot be forced or persisted by Electron.

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
- Linux negotiates the Portal stream during preparation and activates it only after releasing the recording start barrier. Resume prepares the next segment before releasing its new barrier and reactivating PipeWire, preserving the first frame of a static window.

## Studio, Instant and Screenshot

The shared mode button group is also the HUD topbar. Studio is selected until the user changes mode. The existing global shortcut opens Quick Snip using that saved mode.

- Studio records under `user/projects/studio/` and opens the retained project in the Studio editor.
- Instant records under `user/projects/instant/`, applies the chosen video preset, then exports automatically into that project’s `exports/` folder. Format, quality, resolution, frame rate and audio inclusion come from the preset. The source project remains editable.
- Screenshot stores a native PNG and `screenshot.json` under `user/projects/screenshot/<uuid>/`. Quick Snip copies the styled image or opens the screenshot editor. HUD Screenshot opens that editor directly. Screenshot presets are separate from video presets.
- HUD Instant accepts the existing display/window/region selection. Quick Snip retains its platform selection behavior: Windows/macOS region selection; Linux native Portal window selection.
- Legacy immediate project folders move into `projects/studio/` at startup using a resumable rename migration, including reference updates and collision handling.

## Status window and clipboard

- Export/finalization status is a dedicated transparent always-on-top window, requested at the bottom-right of the capture display (Wayland placement remains compositor-controlled).
- A fixed 380×184 native surface contains a 356×76 compact pill with a live composited frame, real progress, and an estimated remaining duration. Preview generation is limited to twice per second and fits within 256×144 pixels.
- Hover or keyboard focus reveals actions above the pill using opacity/translate3d. Neither hover nor progress changes native bounds, placement, or stacking order.
- Windows/macOS transparent space is mouse-pass-through; Linux remains interactive because Electron does not forward mouse motion through ignored windows there.
- Open in Editor is coordinated in the main process. Unfinished exports are canceled while keeping the status requester alive until editor presentation succeeds, so failures remain actionable. Hidden editor initialization runs without background throttling; navigation errors, renderer failure, unresponsiveness and the startup deadline reject the handoff and permit retry. Studio editor state is saved before encoding starts.
- Completed exports are copied automatically; Copy Again and Dismiss remain available. The window closes after five seconds without interaction; hovering, keyboard focus, and pending actions pause dismissal.
- Rendering runs in the existing export Worker hosted by the status renderer. MP4/WebM, composited visuals, cursor, zooms, and audio use the same pipeline as editor export. Main-process authorization selects a destination without a save dialog; export IPC retains ownership of temporary writes and atomic finalization.
- Quick Snip refuses processing when the screen track failed, has no complete accessible video asset, or has no enabled screen clip. A recovered audio-only session reports the capture error instead of producing a background-only video.
- Screenshot uses its own UUID-scoped image media resolver. Studio and Instant projects both remain available in the editor.
- Named presets retain export format, quality, resolution, frame rate and audio inclusion. Default follows current recording devices and the last saved editor/export settings.
- Completed files are published as native files immediately after export finalization. macOS uses `public.file-url`; Windows uses the system FileDrop list with persistent storage; Linux publishes `text/uri-list` through `wl-copy` (Wayland) or `xclip` (X11). The clipboard owner outlives the widget and permits repeated pastes until another copy replaces it. No timer clears or rewrites the clipboard. Linux clipboard tools are declared as DEB/RPM dependencies and documented for development/AppImage. Native paste behavior still requires desktop-specific validation.

## Known gaps before release

The following items are not complete and should block removal of the WIP label:

4. **Windows native exclusion QA** — the Crop Bar enables Electron content protection (`WDA_EXCLUDEFROMCAPTURE` on supported Windows). Confirm visually that WGC omits it when overlapping the recording region. The backend does not additionally consume explicit window-handle exclusions.
5. **Native exclusion QA** — macOS uses explicit ScreenCaptureKit window exclusions and requires a real visual recording test with the Crop Bar intentionally overlapping the capture. Linux window-only capture requires a Portal recording check with the Crop Bar overlapping the selected window.
6. **Preset asset materialization** — imported backgrounds and other project-local resources are not yet copied into a durable user library when saved into a preset.
7. **Unsaved-change decision UI** — New/Rename/Delete use Beam dialogs, but changing presets with dirty editor settings still uses the existing browser confirmation sequence instead of a single Save/Discard/Cancel Beam dialog.
8. **Native end-to-end export QA** — real window/region recording, composited MP4/WebM output, preview delivery, cancellation and clipboard paste still require OS-specific validation.
9. **Cross-platform native clipboard QA** — native file paste must still be verified in Finder and Windows Explorer, with Linux file URI lists verified on supported desktops.
10. **End-to-end recorder QA** — elapsed-time rendering, source toggles, cancellation during startup, Studio project retention, Screenshot image export, and output duration need manual end-to-end recordings on each supported OS.

## Focused automated coverage

The branch includes targeted Node, Vitest, and Rust coverage for:

- preset normalization, migration, CRUD, protected Default, and atomic fallback;
- editor preset composable/UI behavior and reusable dialogs;
- Quick Snip state transitions, cancellation races, late events, and recording exclusion;
- Crop Bar controls, native selects, Default fallback, timer formatting, drag/ownership, and placement;
- region overlay clamping, live updates, cancellation, and native-window ownership;
- finalizer naming, partial cleanup, project-local export paths, cancellation, and preset application;
- status placement, compact mode, hover details, actions, and terminal cleanup;
- tray ordering, state labels, Linux icon handling, and development profile behavior;
- Linux GNOME shortcut registration and single-instance forwarding;
- opaque editor manifest preservation and zoom `enabled` migration.

## Manual verification checklist

- [ ] Start the already-running development build with `Alt+Shift+S`; confirm that no second Beam process/window opens.
- [ ] On Windows/macOS, draw and resize a region while using every Crop Bar control; confirm that the overlay does not steal Crop Bar clicks.
- [ ] Start and stop using both the same shortcut and the Crop Bar button.
- [ ] On Linux, confirm that Start opens the system window chooser and records only the selected window.
- [ ] Record a static Linux window immediately after selecting it, then repeat with pause/resume in the normal recorder; verify the first frame and exported video are present.
- [ ] Stop as soon as Linux reports recording; verify the clip contains its first frame. Cancel during preparation and confirm that no empty export is attempted.
- [ ] Move the Linux Crop Bar over the selected window; verify it remains usable and absent from the video.
- [ ] Verify tray presence and Quick Snip state labels on each supported desktop shell.
- [ ] Verify macOS Crop Bar exclusion with intentional overlap.
- [ ] Verify Instant MP4/WebM output, project retention, disabled zoom behavior, status actions, and clipboard paste.
- [ ] Verify Studio editor handoff, Screenshot display/window/region capture from the HUD, PNG/WebP alpha export, and PNG clipboard paste.
- [ ] Complete and verify every known gap above before declaring the feature release-ready.
