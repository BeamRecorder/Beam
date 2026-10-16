# Zoom motion regressions — 2026-10-16

The report concerns camera choreography: unnecessary left/right travel, stalled pans, fewer distinct zooms and excessive grouping. The correction changes targets and action boundaries, not raster quality, motion blur settings or display cadence.

## Comparison and causes

Recordly was cloned read-only at `0ca9e91edfed0d0e8c9b4451684f7b9f70c98667`. Its [action clustering](https://github.com/webadderallorg/Recordly/blob/0ca9e91edfed0d0e8c9b4451684f7b9f70c98667/src/components/video-editor/timeline/zoomSuggestionUtils.ts) uses a 2.5-second temporal gap and 500 ms padding. Its [follow camera](https://github.com/webadderallorg/Recordly/blob/0ca9e91edfed0d0e8c9b4451684f7b9f70c98667/src/components/video-editor/videoPlayback/cursorFollowCamera.ts) recenters an axis after the pointer leaves its safe zone. Beam retains its independently implemented analytic springs and deterministic 120 Hz simulation. No Recordly source was incorporated.

Commit `370008c7` changed action planning, not spring integration or the playback clock. Its second merge pass treated overlapping ramp envelopes as evidence that separate actions belonged to one shot. The earlier algorithm's click holds at 4.5–5.5, 8.5–9.5 and 12.5–13.5 seconds became one 4.5–14.5-second hold. Large action boxes also reduced magnification, and enforced wide gaps could discard the following opposite-side gesture.

A separate playback problem became more visible with connected plans: a handoff interpolated the stored click focus after auto-follow had acquired another position. The handoff also cleared follow state. It could therefore return toward an obsolete click, pan forward, and reacquire the cursor after arrival.

A stationary cursor at `cx=.75`, outgoing saved focus `.3`, incoming saved focus `.8`, and two 3.5× cinematic shots reproduce this detour:

| Time (ms) | Before focus cx | Corrected focus cx |
| --- | --- | --- |
| 5700 | .684951 | .750000 |
| 6000 | .571641 | .750027 |
| 6200 | .390639 | .752287 |
| 6600 | .562719 | .778545 |
| 7100 | .791022 | .799477 |

Follow correction previously moved only slightly beyond the safe-zone edge, then locked the target for roughly 335 ms with Balanced settings. Sustained travel produced repeated small moves and pauses. The revised target recenters an axis once it leaves the zone, preserving a stable target for interior micro-movements. A direction lock still suppresses brief reversals/new axes, but permits continued travel and releases near the visible edge.

## Corrected behavior

- Independent actions no longer merge just because their ramps are nearby. Typical click holds again use 500 ms before/after the click and a one-second minimum. Long gestures remain intact through release.
- Nearby actions group within 2.5 seconds and an eight-second press window when their framing fits at least 1.5×. Sub-500 ms bursts stay together even across a wide area, avoiding a separate pan for each rapidly clicked list row. A wide uninterrupted drag can use shallow framing and follow the cursor.
- Crowded shots divide their idle interval without deleting either action. Opening/closing bounds that cannot accommodate two holds coalesce only that constrained burst rather than emitting reversed intervals or cutting the previous release.
- A handoff starts from the acquired outgoing target, resolves the incoming automatic endpoint once on its mapped source clock, and seeds the following camera from that endpoint. Both anchors belong to the cloned checkpoint state.
- Cinematic connection eligibility includes the combined ramp duration. A gap just above the old fixed 1.35-second limit no longer lets two ramp envelopes compete, creating an instantaneous scale reversal and a false pan. Edit invalidation uses the same connection window so retained preview history agrees with a fresh export.
- Algorithm twelve refreshes generated plans from earlier revisions through the existing regeneration path. Authored, locked, detached and other-session elements keep their existing protections.
- Existing non-cinematic scale envelopes retain their timing. This correction does not redesign legacy zoom curves.

## Validation

Root reproduced the sub-agent's ten failing regression cases before modifying production code. Focused tests include mirrored x/y detours, forward continuation during locks, micro-movement stability, source-clock/geometry mapping, absent/hidden cursor input, auto/manual handoffs, consecutive short shots, overlapping long ramps, retained edits and reverse seeks. Dense shuffled traces include nonfinite telemetry; opening clicks and uninterrupted drags remain covered.

Camera samples are compared exactly across 24/60/144 fps callers, dropped presentation frames and reverse seeks. Existing cinematic checks also cover 30/120/240 fps. These are deterministic trajectory checks, not native display-performance measurements or a guarantee of subjective preference for every recording.

Local validation passed 226 targeted engine/editor tests, 64 additional focused preview/focus regressions and two real Chromium preview/export comparisons with identical completed pixels. The nine changed camera/planning modules reached 100% statements, functions and lines and 96.64% branches overall, with each module above 90% in all four metrics. After the final type/import cleanup and unchanged-history fast path, the 51 directly affected connection/invalidation tests passed again with 100% statements/functions/lines and 98.07% branches. Desktop and package type checks, scoped formatting/lint, package boundaries and the desktop/CLI build passed. Native Windows/macOS visual behavior and subjective motion preference were not tested on those hosts.


## Calm Orbit opening follow-up (algorithm thirteen)

Read-only inspection of the actual Calm Orbit project confirmed that it had already regenerated with algorithm twelve. Its first 1.5× shot held from 824 to 8125 ms. The first press was at 1104 ms, `cx=.469727`, but the bounding box included actions on the right several seconds later and set the entry focus to `cx=.676758`. At full strength, follow immediately reacquired the approaching cursor on the left. This was an entry regression separate from the corrected handoffs.

Using the real 3072 × 1862 source, 1920 × 1080 canvas, background and translated screen geometry, the horizontal camera focus changed as follows. These are output-normalized camera coordinates; the source press coordinates above have not yet been mapped into that canvas.

| Time (ms) | Algorithm twelve | Algorithm thirteen |
| --- | --- | --- |
| 0 | .500000 | .500000 |
| 600 | .643830 | .478596 |
| 900 | .517922 | .478596 |
| 1100 | .445371 | .478596 |
| 2500 | .431052 | .478596 |

The planner now retains each action's initial press separately from its full path bounds. The path still selects depth and preserves complete drags; the first press selects the entry focus. A derived runtime gate holds that framing until the first visible action. It uses the existing timeline-to-source mapper and excludes presses owned by the preceding hold, including overlapping entry ramps and rounded clip openings. A connected generated destination similarly keeps its action framing while its cursor is still approaching. Explicitly authored automatic regions retain their normal follow behavior. No project schema fields are added.

A reduced anonymous coordinate/timing trace reproduces all four original failures (future-action entry focus, opening detour, and mirrored pre-click approach). Further regressions exercise opening drags, incoming handoffs before their press, source offset/rate mapping, missing/hidden inputs, and exact cadence/seek/checkpoint invariance. The real-source canvas mapping is also tested through the runtime snapshot camera. Algorithm thirteen refreshes older generated plans using the existing protections; original recording files were not modified by the diagnostic.

Follow-up validation passed 239 focused engine/editor tests, thirteen runtime camera regressions, and two real Chromium preview/export comparisons covering generated 2D/orbit entry and post-press frames. Changed implementation coverage is 99.11% statements, 96.25% branches, 100% functions and 98.98% lines; each module exceeds 90% in every metric. Desktop/package type checks, scoped lint/format, package boundaries and the desktop/CLI build passed. Native Windows/macOS visual playback was not exercised.
