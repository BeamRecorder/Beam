# Beam process lifecycle implementation checklist

Plan: [`windows-fix.md`](windows-fix.md)

## Execution rules

- [ ] Keep production source files below 500 lines and preserve the Electron/Rust security boundary. (Lifecycle files comply; pre-existing oversized UI modules, including `HUD.vue`, still require a separate refactor.)
- [x] Sol owns architecture, production changes, integration, diff review, and final gate decisions.
- [x] Delegate bounded research, test authoring/review, and test execution to Luna; Sol reviews all results and runs final validations.
- [x] Use only focused tests for the modules changed. Do not run repository-wide Vitest, Node, coverage, or Rust workspace suites unless the change is genuinely cross-cutting and the reason is recorded first.
- [x] Do not mark platform-specific checks complete unless they were actually run on that platform.
- [x] Do not kill processes by executable name in production or tests; retain and verify exact PIDs/ownership.

## Phase 1 — Reproduce and lock the behavior

- [x] **1. Add deterministic reproduction tests for the current leak**
  - Plan ref: `Problem statement`, `Verification strategy > Deterministic Node/Electron unit tests`.
  - Build: a lifecycle fixture with a main HUD, preloaded hidden countdown window, auxiliary windows, tray, and mocked capture engine.
  - Acceptance: closing the HUD demonstrates why `window-all-closed` cannot be the primary trigger; the test asserts every owned resource that must be destroyed.
  - Verify: `node --test <focused-electron-lifecycle-test>`.

- [x] **2. Define lifecycle states, shutdown reasons, and deadlines**
  - Plan ref: `Central shutdown coordinator`, `Capture-engine termination state machine`.
  - Build: dedicated small modules/types for application state, capture-engine state, shutdown reason, and the contractual `2 s` graceful, `1 s` terminate-exit, `2 s` hard-kill-confirmation, `5 s` total-shutdown, and `3 s` parent-death deadlines.
  - Acceptance: invalid transitions and new work after shutdown are rejected; deadline values are centralized; no modified production file exceeds 500 lines.
  - Verify: focused unit tests for state transitions plus `npm run typecheck`.

## Phase 2 — Fix normal application shutdown

- [x] **3. Enforce a single Beam instance**
  - Depends on: item 2.
  - Plan ref: `Single application instance`.
  - Build: acquire the lock before initialization; exit a losing instance; restore/focus the canonical HUD on `second-instance`.
  - Acceptance: a second launch creates no window, tray, timer, IPC registration, or capture child and focuses the original instance.
  - Verify: focused Electron lifecycle test and manual double-launch check.

- [x] **4. Separate HUD Quit from auxiliary window Close**
  - Depends on: item 2.
  - Plan ref: `Explicit quit semantics`.
  - Build: expose a narrow quit intent for the HUD and route tray Quit to the same coordinator while preserving ordinary editor close → HUD behavior.
  - Acceptance: HUD Close requests application shutdown; closing or returning from the editor destroys only the editor and restores a valid HUD; renderer APIs remain narrow.
  - Verify: focused preload/window IPC tests.

- [x] **5. Add the central idempotent shutdown coordinator**
  - Depends on: items 2 and 4.
  - Plan ref: `Central shutdown coordinator`.
  - Build: gate new work, run bounded native shutdown, destroy resources, and resume quit/update exactly once.
  - Acceptance: concurrent HUD/tray/signal quit requests share one shutdown; a blocked cleanup reaches forced shutdown within the deadline.
  - Verify: focused coordinator tests using fake timers and child fixtures.

- [x] **6. Register and destroy every window/tray resource**
  - Depends on: item 5.
  - Plan ref: `Window ownership registry`.
  - Build: idempotent cleanup for countdown, camera, screen region, teleprompter, editor, HUD, tray, timers, shortcuts, and pending overlay promises.
  - Acceptance: the eagerly preloaded countdown is destroyed; repeated cleanup is safe; no hidden `BrowserWindow` retains Electron.
  - Verify: `node --test test/countdown-window.test.cjs <focused-window-lifecycle-tests>`.

## Phase 3 — Make capture-engine termination provable

- [x] **7. Implement observable child termination and escalation**
  - Depends on: items 2 and 5.
  - Plan ref: `Capture-engine termination state machine`.
  - Build: retain the terminating child handle, reject pending requests, close streams/listeners, await exit, and escalate to exact-child hard kill after deadline.
  - Acceptance: shutdown resolves only after exit is observed or returns a structured unconfirmed-exit failure; repeated calls are idempotent; an old PID and replacement PID are never alive simultaneously.
  - Verify: `node --test test/capture-engine.test.cjs` with focused graceful, timeout, malformed-output, stdin-write-error, child-error, unexpected-exit, kill-error, missing-exit, request-while-terminating, and repeated-shutdown cases.

- [x] **8. Repair poison recovery and IPC session invalidation**
  - Depends on: item 7.
  - Plan ref: `Capture-engine termination state machine`.
  - Build: invalidate uncertain sessions while allowing a later recoverable request to spawn a fresh engine; prohibit respawn during application shutdown.
  - Acceptance: no command reaches a poisoned child; the next allowed request spawns exactly one child; deferred sidecar/native state is cleared.
  - Verify: focused `capture-engine` and `capture-ipc` tests.

## Phase 4 — Cover crashes and hard parent death

- [x] **9. Implement renderer, Electron-child, signal, and fatal-main policies**
  - Depends on: item 5.
  - Plan ref: `Crash policy`.
  - Build: classify HUD renderer loss, editor renderer loss, overlay renderer loss, Electron/GPU child crash, `uncaughtException`, `unhandledRejection`, SIGINT/SIGTERM, and OS session shutdown.
  - Acceptance: no named renderer/child/main fatal path leaves a headless but live Beam owner; the conservative policy shuts down when ownership is uncertain; fatal handlers are reentrant and bounded.
  - Verify: focused lifecycle tests that inject every named event and assert the documented recovery or one terminal shutdown.

- [x] **10. Add independent parent-death protection to capture-engine**
  - Depends on: items 7 and 8.
  - Plan ref: `Parent-death protection`.
  - Build: pass parent identity to Rust; run a watchdog independent of the command loop; add Windows parent-handle/Job protection, Linux `PR_SET_PDEATHSIG` plus race check, and macOS `kqueue` `EVFILT_PROC`/`NOTE_EXIT` plus `getppid()` race check.
  - Acceptance: killing the Electron-owner fixture terminates an idle or command-blocked engine within the crash deadline; PID reuse cannot bind the watchdog to an unrelated process.
  - Verify: affected Rust package formatting/tests/Clippy plus platform-specific parent-death integration tests.

- [x] **11. Contain native descendants**
  - Depends on: item 10.
  - Plan ref: `Process-tree invariants`, `Parent-death protection`.
  - Build: retain exact child handles; place FFmpeg and direct helpers under engine-owned process groups and parent-death setup; attach future Windows descendants to the Job Object; treat `pkexec`/privilege-boundary helpers explicitly.
  - Acceptance: killing Electron or the engine leaves no owned descendant alive, including across privilege boundaries, and never targets unrelated processes.
  - Verify: Linux descendant fixture test and equivalent platform checks where descendants exist.

## Phase 5 — Update path and final proof

- [x] **12. Route update installation through confirmed shutdown**
  - Depends on: items 5, 7, and 8.
  - Plan ref: `Update/install path`.
  - Build: record updater intent, complete bounded shutdown, confirm/escalate native exit, then invoke `quitAndInstall()` once.
  - Acceptance: update during blocked native startup cannot leave the old engine or launch the installer twice.
  - Verify: focused updater lifecycle test.

- [ ] **13. Run the Windows process matrix**
  - Depends on: items 3–12.
  - Plan ref: `Platform integration checks`, `Gate D`.
  - Acceptance: PID/parent evidence shows zero old Beam, capture-engine, or helper processes after HUD Close, tray Quit, each recording phase, updater, renderer crash, forced main death, and repeated launches.
  - Verify: targeted PowerShell/CIM integration script using exact paths and PIDs. Record results without committing machine-specific process data.

- [ ] **14. Run Linux and macOS parity checks**
  - Depends on: items 3–12.
  - Plan ref: `Platform integration checks`, `Gate D`.
  - Acceptance: Linux passes equivalent lifecycle and descendant checks; macOS passes explicit Quit and second-instance checks, with normal window-close activation semantics documented separately.
  - Verify: platform-specific focused scripts/tests. Leave unavailable platforms unchecked and report them.

- [ ] **15. Final review and handoff**
  - Depends on: all applicable items above.
  - Plan ref: `Delivery gates`, `Rollback and safety`.
  - Build: Sol reviews the complete diff, file sizes, process targeting, error paths, tests, and platform evidence.
  - Acceptance: Gates A–D are satisfied; no broad process-name kill exists; no required test is missing; unavailable hardware/platform validation is explicit.
  - Verify: `git diff --check`, focused format/type/build checks, focused Node/Vitest/Rust tests, and the recorded platform matrix.

## Gate summary

- [x] **Gate A — Normal lifecycle:** single instance, explicit Quit, central cleanup, no hidden windows.
- [x] **Gate B — Native lifecycle:** confirmed child exit, bounded escalation, safe respawn, shutdown blocks respawn.
- [ ] **Gate C — Crash containment:** renderer/fatal policies and independent parent-death containment.
- [ ] **Gate D — Platform proof:** Windows evidence complete; Linux/macOS evidence complete or explicitly unavailable.

## Latest validation evidence (2026-08-14)

- [x] TypeScript boundary: `npm run typecheck`.
- [x] Production bundle and native release binary: `npm run build`.
- [x] Recording/UI focused Vitest: 63 passed.
- [x] Electron lifecycle/capture focused Node tests: 34 passed.
- [x] Rust format and strict Clippy for the affected package/binaries.
- [x] Linux FFmpeg/process-group tests: 9 passed, 1 hardware test intentionally ignored.
- [x] Linux input-helper tests: 5 passed.
- [x] Linux real parent-death harness: exact engine PID exited while stdin remained open.
- [x] Windows Rust cross-check: `x86_64-pc-windows-gnu` capture library and engine compile; existing unrelated Windows-cfg warnings remain.
- [ ] Windows runtime recording/process matrix: unavailable from this Linux host; run `scripts/windows/verify-process-lifecycle.ps1` on the target machine.
- [ ] macOS runtime/cross-build: unavailable from this Linux host because the ScreenCaptureKit dependency requires Apple's Swift toolchain.
- [ ] Repository-wide `vue-tsc`: currently blocked by pre-existing errors in HUD/editor/UI modules outside this lifecycle change; the regular changed boundary typecheck and production build pass.
