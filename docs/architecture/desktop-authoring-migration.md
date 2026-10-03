# Desktop and reusable authoring migration

Acceptance criteria for this change:

- [x] All desktop renderer, preload, window and Electron application code lives under `apps/desktop`.
- [x] Desktop and CLI use shared filesystem adapters; engine has no filesystem, Node, Vue or Electron dependency.
- [x] Rust capture transport can be used outside Electron, without moving native capture lifecycle into TypeScript.
- [x] Still document models, layer operations and image rendering are shared packages, used by desktop and CLI.
- [x] Shared command registry can create media assets/clips and edit presentation settings.
- [x] Shared JSON transaction endpoint supports revisions, operation IDs, retries, atomic batches and undo/redo.
- [x] CLI builds into distributable Node modules and a precompiled browser backend, with installed Electron supplying Node.
- [x] Real compiled CLI PNG export succeeds on Linux with DISPLAY and WAYLAND_DISPLAY removed.
- [x] Shared timeline viewport/surface controller renders timeline content on a bounded canvas, retaining zoom/effect/editing gestures.
- [x] Desktop video and screenshot feature folders are independent; video frame -> editable screenshot interoperability is verified.
- [x] HTML/Vue/GSAP authoring uses deterministic frame seeking and the shared renderer/encoder.
- [x] Installed launchers and native capture paths are verified for Linux, Windows and macOS in focused tests.
- [x] New contracts have meaningful focused tests and coverage; package boundaries/type checks/frontend build pass.
- [x] Changelog and architecture documentation describe the final behavior and platform verification limits.
- [x] Review diff and create the final commit.

Ordered transactions are preparation for collaborative adapters. They are not a CRDT implementation; a future collaborative transport must resolve concurrent edits rather than discarding revision conflicts.

Verification evidence:

- Focused core authoring/storage/frame tests: 53 passing, with 99.78% statements, 98.26% branches, 97.14% functions and 99.75% lines across the selected modules.
- Shared timeline surface/clock: 12 passing tests, with 99.25% statements, 96.36% branches and 100% functions/lines across the selected modules.
- Real displayless Chromium: completed preview/export pixel comparisons (8 cases) and the actual Vue timeline with 10,000 clips, one bounded bitmap and virtualized semantic controls.
- Compiled CLI and the Linux packaged Electron launcher render an actual Vue SFC/GSAP animation. Decoded red-pixel centers advance on all four frames. Extracting a video frame and editing its image mirror changes its red-pixel center from 15.5 to 47.5.
- Linux Electron directory package and AppImage build. AppImage CLI dispatch is exercised with extraction mode; its native runtime also emits extraction filenames, so this mode's stdout is not a pure JSON stream.
- Packaged ASAR resolves the shared native transport, atomic JSON adapter and scene validator. Targeted Electron stores/window/IPC tests: 166 passing; targeted native/storage/dev launcher tests: 64 passing, plus the final 6 CLI packaging tests.
- TypeScript, Vue, package and website type checks; frontend/CLI builds; formatter and package dependency/500-line boundaries pass. Build output retains ordinary chunk-size warnings.

Native Rust sources were unchanged. Packaging smoke uses existing local Linux release capture/helper binaries; hardware recording and native Windows/macOS execution are not verified here. Windows/macOS launcher paths and compiler architecture requirements are tested, and CI builds the CLI with matching optional x64/ARM64 bindings. CRDT synchronization and desktop loading of programmable HTML assets remain separate host/transport integrations.
