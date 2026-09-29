# Native application complexity audit

Measured on 2026-09-29, before and after the focused corrections. Complexity is a source-level review aid; it does not measure UI latency. Presentation measurements are recorded in [native-recorder-profile.md](native-recorder-profile.md).

## Method and scope

TypeScript/TSX was parsed with TypeScript 5.9.3 and Rust with Syn 2.0.117. Each function, method and closure starts at 1. Nested functions are measured separately. The score adds one for each `if`, conditional loop, boolean `&&` / `||`, JavaScript ternary or `catch`, and non-default JavaScript `case`. Rust `match` adds arms minus one, plus one per guard. Nullish coalescing and Rust `?` exits are recorded but excluded. Optional chaining, iterator calls and macro-expanded control flow are not counted. Rust `cfg` alternatives are all inspected.

Scope: production `.ts` / `.tsx` under `packages/beam-ui/src/solid`, excluding tests and generated files; Rust under `apps/beam-native/src`, `packages/media-session/src` and `packages/screen/src`. Native editor code has its own aggregate. Libraries such as `editor-engine`, audio and encoding were not audited. All files parsed; no audited production source exceeded 500 lines. Scores 11–20 and 21+ are review bands, not additional repository gates.

## Distribution

| Area | Functions before → after | 1–10 before → after | 11–20 before → after | 21+ before → after | Maximum before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Beam UI | 958 → 1017 | 940 → 1005 | 14 → 12 | 4 → 0 | 24 → 17 |
| Native recorder | 810 → 841 | 790 → 825 | 15 → 14 | 5 → 2 | 38 → 29 |
| Native editor | 101 → 101 | 101 → 101 | 0 → 0 | 0 → 0 | 9 → 9 |
| Capture packages | 1153 → 1157 | 1130 → 1135 | 19 → 19 | 4 → 3 | 64 → 64 |

The final counts include the window-scoped presentation profiler and capability-aware auxiliary warmup. Extracted helpers increase function count; the purpose is explicit responsibilities and failure handling, not reducing the aggregate branch count.

## Corrections completed

| Entry point | Before → after | Result |
| --- | ---: | --- |
| [Region event routing](../apps/beam-native/src/desktop_application/region/events.rs) | 38 → 5 | Separate native events, host messages, presets, control presentation and DPI updates; retain revision and drag guards. |
| [Auxiliary actor closure](../apps/beam-native/src/runner/auxiliary.rs) | 25 → 4 | Explicit mount, first acknowledgement and delivery pump; scoped cleanup on every exit. |
| [Capture `record`](../packages/beam-ui/src/solid/hud/useCaptureSession.ts) | 17 → 7 | One run owns preparation, countdown, start and cancellation across asynchronous boundaries. |
| [Teleprompter `prepare`](../packages/beam-ui/src/solid/teleprompter/usePlayback.ts) | 24 → 7 | Pure measured progress calculation; retain visibility, revision and playback checks. |
| [Main event routing](../packages/beam-ui/src/solid/appEvents.ts) | 22 → 9 | Named application and geometry handlers; callbacks delegate directly. |
| [Region pointer routing](../apps/beam-native/src/desktop_application/region/interaction.rs) | 21 → 8 | Separate starting, moving and finishing gestures; paired pointer capture/release. |
| [Media-session `stop`](../packages/media-session/src/session/finish.rs) | 21 → 1 | Explicit source shutdown, telemetry, finalization and persistence; preserve partial-failure recovery. |
| [Main JS pump](../apps/beam-native/src/runner/js_loop.rs) | 19 → 7 | Separate reload, input, profile and service delivery. |
| [Splitter](../packages/beam-ui/src/solid/editor/layout/Splitter.tsx) | 22 → 2 | Shared orientation geometry and named activity/visual accessors. |
| [Document validation](../packages/beam-ui/src/solid/teleprompter/documentValidation.ts) | 21 → 8 | Separate numeric and choice validation without weakening bounds or changing errors. |

`ActorSession` releases registered actors, routes and pending requests on normal return, errors and unwind. `NativeScene` disposes mounted QuickJS trees even when initial acknowledgement or later delivery fails. A failed disposer does not prevent registry cleanup. This fixes the concrete leak identified in the audit; it does not establish the cause of the reported background-window freeze.

Cancellation waits for in-flight native preparation/operations before closing the prepared session. A disabled countdown no longer waits for a timer tick. Seven missing Rust test mirrors were added for desktop appearance, platform implementations, Linux icon settings and one-use portal restoration.

## Remaining explicit mappings

- `ui_event_payload`: 29, a flat native-event conversion. Its score changed from 28 because an additional native event is present in the final tree.
- `preferences::apply_patch`: 21, independent optional preference fields.
- Platform keyboard mappings: 63–64, explicit key catalogs.

These have no lifecycle nesting or newly identified bug and remain explicit. Measurement scripts and raw results are in `/tmp/beam-complexity-audit/`.
