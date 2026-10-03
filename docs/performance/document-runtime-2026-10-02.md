# Immutable documents and shared headless rendering — 2026-10-02

[Raw document measurements](document-runtime-2026-10-02.json) were collected with
Bun 1.4.2 on Linux x86_64, Intel Core Ultra 5 125H. The baseline clip engine was
saved before replacing its whole-document JSON clone. Both paths validate edits;
the baseline records copied snapshot history, while the new path executes the
same visibility toggle through an immutable document session.

Each document contains 1,000 or 10,000 full color clip records. Ten toggles warm
each path, followed by 50 measured toggles. Timing includes command execution,
validation and history recording. Retained records count distinct clip object
identities across the 50 returned states, not estimated heap bytes.

| Clips | Before median / p95 | After median / p95 | Retained clip records before / after |
| --- | --- | --- | --- |
| 1,000 | 3.32 / 14.40 ms | 0.87 / 1.49 ms | 50,000 / 1,049 |
| 10,000 | 41.83 / 84.41 ms | 9.58 / 10.91 ms | 500,000 / 10,049 |

The measured median improvement is 3.81× and 4.37× for these edits. Initial
document ownership still copies and freezes input once. Mutable desktop
presentation history still copies its snapshots. These numbers do not establish
an overall playback/export improvement, nor a general comparison with other editors.

`bun run beam benchmark DOCUMENT.json 10000` now reports separate prepare, seek
and edit stages, with at most 200 document edits and bounded measurement rings.
Compare workloads and backend settings explicitly when extending these results.
The retained baseline command is reproducible from Git revision
`4143b8078c8f704f6a009483a94e0741b2ab1ad8`; the comparison reuses current shared
validators and layout helpers on both paths to isolate command/history copying:

```sh
bun scripts/performance/compare-document-edits.mjs
```

Real Chromium integration removes DISPLAY and WAYLAND_DISPLAY from the launched
browser. Completed RGBA comparisons cover flat scenes, nested overlapping
opacity, transformed masks, reverse animation seeks, camera perspective, decoded
screen surfaces and cursor ripples, generated text/overlay groups and actual
WebGL blur. Preview's desktop adapter and offline rendering produced identical
channels at the tested times. Deterministic audio tests cover nested local clocks,
generic volume/normalization/visibility sampling and backend sample-rate curves.

Actual displayless CLI jobs produced VP9 WebM with GPU blur and AVC/AAC MP4 with
animated audio, decoded VP9 input and an imported font using Chrome for Testing
154.0.8037.57 and explicit SwiftShader software WebGL. The CLI builds and serves
its own bundle, without Vue, Electron or source
file access. Imported fonts use explicit host URLs. Physical GPU acceleration
and Windows/macOS backend behavior were not measured in this Linux validation.

Run the hardware/backend integration explicitly after installing the browser:

```sh
bun run beam browser install
BEAM_HEADLESS_TEST=1 bunx vitest run apps/cli/src/headless-render.integration.test.ts
env -u DISPLAY -u WAYLAND_DISPLAY bun run beam export REQUEST.json OUTPUT.webm
```
