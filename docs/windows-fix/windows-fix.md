# Beam process lifecycle and orphan prevention plan

## Status

- Scope: Windows first, with equivalent guarantees on Linux and macOS.
- Purpose: prevent Beam, `capture-engine`, and native helper processes from surviving after Beam is closed or its owning process dies.
- This document is a design and verification contract. Implementation progress is tracked in [`task.md`](task.md).
- Deterministic implementation gates are complete in the current working tree; Windows hardware/process-matrix proof remains mandatory before release sign-off.

## Problem statement

Closing Beam can leave an Electron process running in the background. Reopening Beam then creates another independent process, so Task Manager shows an increasing number of Beam processes. If native capture has been used, the old Electron instance can also retain a `capture-engine.exe` child.

The original normal-close failure was deterministic:

1. `createCountdownWindow()` eagerly creates a hidden `BrowserWindow` at startup.
2. The HUD close action closes only the HUD `BrowserWindow`.
3. The HUD cleanup destroys the editor, tray, teleprompter, camera overlay, and region overlay, but not the countdown window.
4. Because one hidden window remains, Electron does not emit `window-all-closed`.
5. `app.quit()` is not called, so `before-quit` never reaches `captureEngine.shutdown()`.
6. There is no single-instance lock, so another launch starts another complete Beam instance.

The current shutdown code also does not prove that a child has exited: it sends `child.kill()`, clears `this.process`, and resolves without waiting for the child's `exit` or `close` event. Electron lifecycle hooks are also insufficient for hard crashes because `before-quit` and `will-quit` are not guaranteed after abrupt process termination.

## Goals

1. The HUD close action must mean "quit Beam" and complete through one idempotent application shutdown coordinator.
2. Only one Beam application instance may run for a user session. A second launch must focus or restore the existing HUD and then exit.
3. Every Beam-owned window, tray, timer, listener, IPC operation, and capture child must be released on normal exit.
4. `capture-engine` must exit after graceful quit, command timeout, renderer failure requiring application termination, updater installation, OS shutdown, signal termination, or death of the Electron main process.
5. No uncertain or timed-out native engine may be reused.
6. Shutdown must have bounded deadlines. A blocked native command must not block Beam exit indefinitely.
7. Session cleanup should be graceful when possible, but orphan prevention wins after the graceful deadline expires.
8. The guarantees and tests must cover Windows, Linux, and macOS, with platform-specific checks documented when they cannot run locally.

## Non-goals

- Do not change the `windows-capture` recording implementation to solve Electron orchestration bugs.
- Do not make renderer components own native process lifecycle.
- Do not expose generic process, filesystem, or IPC access through preload.
- Do not kill processes by broad executable-name matching. Termination must target only the exact child PID or OS-owned process group created by this Beam instance.
- Do not treat normal auxiliary Electron renderer/GPU processes as leaks while their owning main process is still intentionally running.

## Required invariants

### Contractual deadlines

Use named constants rather than scattered timeout literals. Initial contract:

- graceful native stop: `2_000 ms`;
- exit after the first termination request: `1_000 ms`;
- hard-kill confirmation: `2_000 ms`;
- total normal application shutdown: `5_000 ms`;
- parent-death detection through forced native exit: `3_000 ms`.

Platform tests may justify tighter values later, but must not silently extend them. Timing tests should use fake clocks where possible and a bounded tolerance only for real process integration tests.

### Application invariants

- At most one Electron main process owns a given Beam user-data directory.
- The custom HUD Close action always requests application quit; it never only hides or closes the HUD.
- Once shutdown begins, it is monotonic and idempotent: no new windows, capture commands, recordings, or update actions may start.
- Normal quit reaches a terminal state within a documented maximum duration.
- After terminal shutdown, no Beam-owned native window or tray remains.

### Capture-engine invariants

- One `CaptureEngine` instance owns at most one live child and, while terminating, retains the child handle until exit is observed.
- A timed-out, malformed, crashed, or otherwise uncertain engine is poisoned and terminated.
- All pending requests are rejected exactly once with the originating command and termination reason.
- A fresh request after recoverable engine termination may spawn one fresh engine; it must never talk to the poisoned child.
- The old child PID must have a confirmed exit before a replacement is spawned; old and replacement PIDs must never overlap.
- Application shutdown disables respawn permanently for that application instance.
- After the Electron owner dies, `capture-engine` must terminate without relying solely on Electron lifecycle events.

### Process-tree invariants

- Beam never terminates an unrelated process, including another user's process with the same executable name.
- Any process spawned by `capture-engine` is placed under an equivalent parent-death/process-group policy.
- PID reuse must not allow a watchdog to attach itself to an unrelated process. Parent identity should use an OS handle where possible, or PID plus a startup identity check where it is not.

## Architecture

### 1. Single application instance

Acquire `app.requestSingleInstanceLock()` before `app.whenReady()` initialization.

- If the lock is unavailable, the second process must request attention from the existing instance and exit before creating windows, tray objects, timers, IPC handlers, or a capture engine.
- The `second-instance` handler must restore the existing HUD through the canonical window controller path, including minimized/hidden/editor states.
- The handler must not create a second main window.
- Add a focused lifecycle test proving that losing the lock prevents initialization.

This prevents process accumulation but is not a substitute for correct shutdown.

### 2. Explicit quit semantics

Replace the renderer's ambiguous window-close request with a narrow application-quit intent for the HUD. Keep ordinary window close behavior only where closing a child window is valid.

The main process must decide whether a request means:

- close an auxiliary/editor window and return to the HUD; or
- quit the entire application.

The HUD Close action and tray Quit action must converge on the same shutdown coordinator. Closing the editor window is different: it destroys the editor and returns to the valid HUD unless the user selected an explicit application Quit action. The updater must enter the coordinator before `quitAndInstall()` is allowed to finish.

### 3. Central shutdown coordinator

Introduce a focused Electron lifecycle module rather than expanding `electron/main.cjs`. It should own a state machine such as:

```text
running -> graceful-shutdown -> forced-shutdown -> exited
```

The coordinator receives bounded cleanup functions for:

- capture engine;
- countdown, camera, screen-region, teleprompter, editor, and HUD windows;
- tray and global shortcuts;
- storage owners and pending sidecar writes;
- update installation handoff.

Required behavior:

1. Atomically mark the application as shutting down.
2. Reject new capture and window-creation requests.
3. Hide nonessential overlays immediately so no invisible window can retain the app accidentally.
4. Ask the capture engine to stop/cancel gracefully, using the actual known native state.
5. Wait for native exit up to the graceful deadline.
6. Force-terminate the exact child/process group if the deadline expires.
7. Destroy every window and tray idempotently.
8. Remove timers, shortcuts, and listeners.
9. Resume the original quit or updater action exactly once.

`before-quit`, tray Quit, HUD Quit, signal handlers, OS session shutdown, and updater installation must all call this coordinator. A normal editor-window close returns to the HUD and does not terminate Beam. `will-quit` remains a final synchronous/best-effort safety net, not the primary cleanup path.

### 4. Window ownership registry

Every auxiliary window manager must expose an idempotent `destroy()` that:

- destroys its live `BrowserWindow` if present;
- clears internal references, readiness flags, pending promises, and timers;
- is safe before creation, after failure to load, after natural close, and after repeated calls.

Register the countdown window alongside the camera, region, teleprompter, and editor windows. Do not depend on `window-all-closed` to initiate cleanup: hidden windows are precisely what can prevent that event.

`window-all-closed` should remain defense in depth. On Windows and Linux it may request application shutdown if shutdown has not already started. macOS behavior must be an explicit product decision, but the HUD's explicit Quit action still quits on every platform.

### 5. Capture-engine termination state machine

Refactor `CaptureEngine` so process termination has observable completion.

Suggested internal states:

```text
stopped | running | poisoned | terminating | shutdown
```

`terminateProcess(reason, options)` must:

1. Capture the exact child reference and mark it unavailable for requests.
2. Reject and clear every pending request exactly once.
3. Close stdin and readline interfaces/listeners without allowing old child events to affect a replacement child.
4. Request normal termination when appropriate.
5. Wait for `exit`/`close` with a short deadline.
6. Escalate to a platform-appropriate hard kill of that exact child or owned process group.
7. Resolve only after exit is observed, or return a structured failure saying that exit could not be confirmed.
8. Permit respawn only for recoverable runtime termination, never after application shutdown begins.

Do not set the only child reference to `null` before retaining a separate terminating handle. Do not silently ignore a false `child.kill()` result or a kill error. Child `error`, unexpected `exit`, invalid protocol output, write failure, and request timeout must converge on the same termination path.

The IPC adapter must invalidate the active/deferred session when an engine becomes uncertain. It must allow a subsequent safe command to create a fresh engine instead of permanently rejecting all requests because a previous child was poisoned.

### 6. Parent-death protection

Electron hooks cannot cover `TerminateProcess`, `kill -9`, native crashes, power loss, or a main thread stuck before its hooks run. The native child therefore needs an independent parent-death mechanism.

Pass the Electron main PID and a per-launch identity token to `capture-engine`. Establish the watchdog before accepting capture commands.

- **Windows:** prefer an OS parent process handle or Job Object with kill-on-owner-close semantics. If the child owns the watchdog, wait on the exact parent handle rather than polling only a reusable PID.
- **Linux:** use `PR_SET_PDEATHSIG` with the required post-registration parent check. Native descendants such as FFmpeg/input helpers must receive equivalent process-group or parent-death ownership.
- **macOS:** use a dedicated `kqueue` watcher registered with `EVFILT_PROC`/`NOTE_EXIT` for the startup parent PID, then immediately validate `getppid()` to close the registration race. The kernel event registration identifies the watched process instance; stdin EOF remains defense in depth. If the watcher cannot be established, native startup must fail closed rather than run without parent ownership.

On parent death, first request cooperative session shutdown. If capture code does not respond within a short crash deadline, force the native process to exit. A blocked capture command must not prevent the watchdog from running, so the watchdog cannot live only on the command-processing thread.

The existing stdin-EOF behavior remains useful and should be tested, but it is not the only protection.

Direct native descendants must be owned explicitly:

- place Linux encoder/helper children in an engine-owned process group and set parent-death behavior in each direct child's pre-exec path;
- keep exact `Child` handles for graceful cleanup and use the owned group only for forced escalation;
- attach any future Windows descendants to the same kill-on-close Job Object;
- use an engine-owned process group plus exact child handles for macOS descendants;
- treat privilege-boundary helpers such as `pkexec` as separate ownership cases and prove their exit rather than assuming they remain in the group.

### 7. Crash policy

Distinguish failures by owner:

- **Primary HUD renderer gone:** enter controlled application shutdown unless a tested renderer-recovery path is intentionally implemented.
- **Editor renderer gone:** close the editor safely and either return to a valid HUD or terminate if application state is uncertain.
- **Overlay renderer gone:** destroy that overlay, reject its pending operation, and continue only if capture state remains valid.
- **Electron child/GPU fatal failure:** classify the Electron-provided reason; shut down when UI or capture correctness is uncertain.
- **Uncaught main-process exception/unhandled rejection:** log minimal diagnostics, trigger bounded best-effort termination, then exit nonzero. Do not keep a partially initialized background app alive.
- **SIGINT/SIGTERM and OS session shutdown:** use the same coordinator with a bounded deadline.
- **Hard main-process death:** rely on the independent parent-death mechanism.

Fatal handlers must be reentrancy-safe and must not attempt complex recovery after the runtime is already corrupted.

### 8. Update/install path

`quitAndInstall()` must not bypass process cleanup.

1. Mark the updater intent.
2. Run the central shutdown coordinator.
3. Confirm native child exit or perform the forced termination path.
4. Invoke the updater exactly once.

Tests must cover a blocked native startup during update installation.

## Failure reporting and observability

Add development diagnostics and structured test hooks for:

- Electron PID, capture-engine PID, and parent identity;
- shutdown source (`hud`, `tray`, `window-all-closed`, `updater`, `signal`, `renderer-crash`, `fatal`);
- lifecycle state transitions;
- graceful and forced termination deadlines;
- child exit code/signal and whether exit was confirmed;
- cleanup errors collected by resource.

Do not log user media, command payloads containing private paths, or secrets. Packaged builds should retain only bounded actionable diagnostics suitable for a copyable error report.

## Verification strategy

### Deterministic Node/Electron unit tests

- Losing the single-instance lock exits before initialization.
- A second instance restores the existing HUD.
- HUD Quit, tray Quit, window close, updater, and signals call the coordinator once.
- Every registered window manager is destroyed, including a preloaded hidden countdown.
- Repeated shutdown calls share one result.
- Renderer crash paths follow the documented policy.
- A blocked cleanup reaches forced shutdown within the deadline.

### Capture-engine process tests

Use a purpose-built fixture process rather than real hardware capture where possible.

- Graceful shutdown observes child exit.
- Request timeout rejects all pending requests and kills the child.
- A recoverable next request spawns exactly one new child.
- Application shutdown disables respawn.
- Closing the parent pipe makes the Rust engine exit and finalize/drop its session.
- Killing the Electron-owner fixture kills the engine within the crash deadline.
- A child blocked in a command is still terminated by the parent-death watchdog.
- Nested native helpers/processes do not survive their owning engine.
- Invalid JSON output, stdin write failure, child `error`, and unexpected exit all poison and terminate the engine.
- A failed kill, missing exit event, shutdown timeout, and request during `terminating` produce deterministic structured outcomes.

### Platform integration checks

On Windows, identify processes by executable path, PID, and parent PID using PowerShell/CIM rather than name-only matching. Validate:

- HUD close before capture;
- HUD close during countdown, native prepare, native start, recording, and finalization;
- tray Quit;
- update install;
- renderer crash;
- forced termination of the Electron main PID;
- repeated launch attempts.

Equivalent Linux checks should inspect exact executable paths and `/proc` parentage. macOS checks should use exact PIDs/process ancestry and distinguish normal app activation semantics from explicit Quit.

For every scenario, the acceptance condition is:

```text
within the documented deadline:
  zero old Beam main processes
  zero old capture-engine processes
  zero old Beam-owned helper/encoder processes
  a second launch does not create a concurrent owner
```

Hardware-dependent capture checks must be reported separately from deterministic lifecycle tests.

### Process-proof harnesses

- Windows normal close: `powershell -ExecutionPolicy Bypass -File scripts/windows/verify-process-lifecycle.ps1 -BeamExecutable 'C:\exact\path\Beam.exe' -ExitMode Close`
- Windows abrupt main death: use the same command with `-ExitMode Crash` while recording or while a deliberately blocked native start is active.
- Linux parent-death proof after building the engine: `scripts/linux/verify-parent-death.sh "$PWD/target/debug/capture-engine"`.

The Windows harness records the exact root/descendant PID and executable path before termination and only evaluates those identities afterward. It never uses broad name-based termination. Run it once per recording-matrix configuration; its `ObservationSeconds` interval is the time available to put Beam into the desired phase.

## Delivery gates

### Gate A: normal lifecycle

- Single-instance behavior is enforced.
- HUD Close and tray Quit converge on one coordinator.
- Hidden countdown and every auxiliary window are destroyed.
- Focused Node tests pass.

### Gate B: native lifecycle

- Termination waits for actual child exit and escalates on timeout.
- Poisoned-engine recovery spawns a fresh child safely.
- Shutdown prohibits respawn.
- Focused engine and IPC tests pass.

### Gate C: crash containment

- Renderer and main-process fatal policies are implemented.
- Independent parent-death behavior is implemented and tested on supported platforms.
- Nested native children cannot become orphaned.

### Gate D: platform proof

- Windows manual/integration matrix passes with recorded PID evidence.
- Linux equivalent tests pass where available.
- macOS explicit-Quit behavior passes where available.
- Any unavailable platform validation is clearly reported and remains unchecked in `task.md`.

## Rollback and safety

- Keep the single-instance change separable from native watchdog work so it can be validated independently.
- Never use broad `taskkill /IM`, `pkill`, or executable-name cleanup in production.
- Preserve session recovery data when forced termination interrupts finalization.
- Do not mark the work complete based only on an empty Task Manager view; tests must prove that the expected PID exited and was not replaced or detached.
