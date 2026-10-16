# Automatic zoom motion — 2026-10-15

This change addresses missing opening interactions, long merged zooms and abrupt cinematic handoffs through Beam's shared camera evaluator. Automatic generation advances to algorithm eleven so projects saved during intermediate development revisions recalculate their generated plans.

## Sources inspected

| Implementation | Revision | Relevant behavior |
| --- | --- | --- |
| [OpenScreen planner](https://github.com/getopenscreen/openscreen/blob/27bf34f389de646a9838e81518d86e1fbe7acf54/src/lib/ai-edition/timeline/zoom-suggestions.ts) | `27bf34f` | Groups clicks within three seconds when their bounding box fits; reserves 2.5 seconds at the opening and one at the end; merges crowded shots or drops the less active group. This explains both missing early clicks and potentially long chained shots. |
| [OpenScreen transition math](https://github.com/getopenscreen/openscreen/blob/27bf34f389de646a9838e81518d86e1fbe7acf54/src/lib/zoomMath/mathUtils.ts) | `27bf34f` | Logarithmic scale interpolation with a finite normalized critical-spring envelope. The finite normalization leaves a small nonzero incoming derivative at its clamp. |
| [Cap generator](https://github.com/CapSoftware/Cap/blob/83237e994efb1e9842933d279ae2b338549be545/apps/desktop/src-tauri/src/recording.rs#L6368) | `83237e9` | Click intervals start 300 ms early and end 2.5 seconds later; intervals within another 2.5 seconds merge. Therefore a literal port can produce even longer merged zooms. |
| [Cap camera timeline](https://github.com/CapSoftware/Cap/blob/83237e994efb1e9842933d279ae2b338549be545/crates/rendering/src/zoom_spring.rs) | `83237e9` | Fixed eight-millisecond analytic spring steps retain velocity across target changes. Source clocks map through edits; framing pre-aims near identity and holds its last target during exit. |

Cap's rendering sources are AGPLv3; no Cap source is incorporated. Beam retains its own analytic springs and deterministic checkpoints. The existing MIT OpenScreen attribution remains in `public/THIRD_PARTY_NOTICES.md`.

## Beam behavior

- A visible press owns its gesture through release. Visible movement and release positions determine framing; hidden positions do not enlarge it. Sidecars without releases remain click-only rather than inferring drags from unrelated motion.
- The opening is wide at time zero and can immediately begin its entry. An early click can lie inside that entry instead of being discarded. The final second remains protected from the recording Stop click.
- Grouping allows at most eight seconds between the first and last press. A final long drag can finish beyond that window. Later crowded groups retain actions that fit after a real wide interval; they cannot erase the opening simply by having more clicks. Authored, locked and detached zooms remain protected by existing generation rules.
- Cinematic magnification follows a quintic minimum-jerk envelope in log space, with zero first and second derivatives at both endpoints. Existing non-cinematic zoom curves retain their timing.
- Connected cinematic holds share one continuous pan instead of briefly zooming out and switching to a hard-coded second transition. Short consecutive holds divide their transition windows at the shared shot's midpoint. Manual/automatic orbit connections fade cursor-follow amplitudes continuously.
- Focus prepares while scale is within `0.00001` of identity. Spring velocity survives subsequent changes. Output focus stays inside the available viewport. Direction locking yields near the visible edge so a fast gesture can request a correction immediately.
- The camera's 120 Hz simulation and source-time mapping remain shared by preview and export, independent of the caller's frame cadence.

## Reported recordings

Read-only inspection found the following original algorithm-nine state:

| Recording | Original omission | Revised generation |
| --- | --- | --- |
| Quiet Studio 4, 20.801 seconds | First click at 1.276 s and drag at 3.170–6.828 s had no covering zoom. The next drag's zoom ended at 9.140 s despite release at 10.537 s. | Holds at 0.924–12.037 s and 16.583–18.877 s. Both early drags remain covered; approximately 2.7 seconds of fully wide view separate the ramped shots. |
| Soft Canvas 3, 20.200 seconds | Its only shot began at 6.871 s, missing the clicks at 0.586 s and 1.415 s and the drag at 3.072–5.933 s. | Holds at 0.723–7.433 s and 10.580–18.276 s. The first click is already magnifying during entry; the first drag is covered throughout. |

The real files were used for local checks; reduced coordinate/timing traces are regression tests. Native project metadata was not edited by the diagnostic. An open development editor can independently regenerate and autosave when source changes hot-reload; saved states from such intermediate revisions are not the original baseline above.

Automatic planning took approximately 1–4 ms locally for these traces. This is distinct from pixel-based hover analysis.

## Hover analysis cost

The normal synchronization toast is removed in every locale; persistent localized failures remain. The analysis still decodes video and can take seconds, especially with software graphics. It remains cancellable and does not gate initial editor data.

Previously, `CanvasSink` created full-source downsampling mipmaps before the caller discarded duplicate VFR frames. The revised iterator closes duplicate samples before conversion and draws unique samples directly into one CPU-oriented canvas of at most 384 pixels per dimension. Video sample rotation/flip are preserved by Mediabunny's sample painter. The GPU difference grid and 60 Hz movement-neighborhood requests are unchanged.

On the 3072 × 1862 Quiet Studio 4 recording, with 427 encoded frames and 659 requested neighborhood timestamps, a fresh headless Chromium 154/SwiftShader development worker completed in **35.115 seconds**; the subsequent cache read took **13.7 ms**. The previous path did not finish within the diagnostic's **180-second** protocol deadline. This is a censored baseline, not an exact speedup, and is not a hardware-accelerated Electron timing claim. Other applications were active on the machine.

## Validation contract

Focused tests cover original-clock trim/resume/rate mapping, early clicks, complete drags, hidden-pointer coordinates, older sidecars, long uninterrupted gestures, bounded dense click chains, reserved zooms, zero-gap/short cinematic handoffs, numerical endpoint derivatives, mixed manual/automatic orbit modes, checkpoint reuse and reordered seeks at 24/30/60/120/144/240 fps. Deterministic hostile traces include shuffled and nonfinite telemetry.

Local validation passed 303 unit tests across 25 focused files and 14 real Chromium checks: seven hover-analysis cases and seven completed-render/reference cases. The two new cinematic preview/export cases also passed after the final analytic sub-tick scale change. All thirteen changed implementation modules meet the 90% coverage gate separately for statements, branches, functions and lines. Desktop, engine and runtime type checks, scoped lint/format checks, package boundaries and the final diff check passed. No Rust code changes are involved.

Hover tests verify duplicate rejection before drawing, one retained small canvas, exact lease cleanup on completion/cancellation/consumer exit/draw or decode failure, original segment clocks, and persistent localized errors. Real Chromium tests decode actual video and check hover alignment and shared rendering. Native Windows/macOS playback performance and subjective visual preference require testing on those hosts.
