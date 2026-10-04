# Dense rectangle preview

The measured project contains 10,000 rectangles spanning the same 60-second interval, plus 816 video clips, eight screen clips, 64 effects, four captions and one audio clip. It has 10,893 clips in total. This workload draws thousands of simultaneous layers; it differs substantially from 10,000 consecutive clips in one timeline lane.

## Changes and verification

Canvas marquee geometry is now evaluated on demand. Idle rendering and playback no longer project all 10,000 rectangles into selection targets. Paused multiple-selection outlines and active marquee gestures still resolve current geometry. Component tests verify those transitions and gesture snapshots.

The preview reads draft state once per frame, borrows evaluated layers when there is no draft and queries media frames only for media clips. A 10,000-rectangle test verifies that only the screen clip requests a decoded frame. Drafts copy affected records while preserving untouched identities, including IDs that match JavaScript prototype property names.

Native and GPU shape painters share checked, weakly owned normalized styles. Mutable Screenshot properties, replacement edits, keyframes and transform drafts invalidate paint decisions. Empty text no longer creates a copied shape record on every paint. The ordered runtime omits completely offscreen rectangles, with conservative stroked bounds and a physical-pixel antialiasing guard. Preview and export use this same decision.

Real displayless Chromium compares completed RGBA pixels against the original native rectangle tracing at four fractional zoom scales, with 10,000 overlapping colored shapes, clipping, and additional opacity/shadow cases. All six comparisons have zero differing channels. Completed preview/export parity also passes. Rasterizing or replacing the native fractional outline geometry changed edge pixels during investigation, so that approach is not shipped.

## Measurements and limits

The real desktop project is copied into an isolated directory and opened in a temporary instrumented production build. Original project files remain read-only. The hidden 1280 × 800 Electron window runs on Linux with an Intel Core Ultra 5 125H, Electron 44.5.1 and Chromium 152. Chromium reports Canvas2D, compositing, rasterization and video decode enabled. This feature status does not establish that every drawing operation executes on hardware.

Hidden-window animation frames ran at roughly one-second intervals despite disabled background throttling. They are unsuitable for measuring onscreen playback FPS. Instead, the completed-frame harness seeks to fixed scene times and alternates offscreen omission enabled/disabled within the same process. Each mode has two warmups and ten samples. All other current rendering behavior is shared. CPU submission stops after drawing commands; completion additionally reads the actual RGBA output, forcing pixel completion.

| Scene time | CPU, all rectangles | CPU, visible rectangles | Completed, all | Completed, visible |
| --- | ---: | ---: | ---: | ---: |
| 0 s | 63.5 ms | 54.2 ms | 198.3 ms | 203.5 ms |
| 0.75 s | 34.6 ms | 37.9 ms | 113.0 ms | 106.0 ms |
| 1.5 s | 46.6 ms | 32.7 ms | 134.8 ms | 224.9 ms |
| 4 s | 41.5 ms | 45.2 ms | 108.4 ms | 115.3 ms |

These are medians, not FPS. Decode, Vue updates and onscreen presentation are excluded. Completed rendering remains expensive and variable; these measurements do **not** demonstrate a stable global playback speedup or 60 FPS. The CPU reduction during part of the zoom does not imply a GPU/completion reduction. See [the recorded measurements](preview-dense-2026-10-02.json) for p95 values and environment details.

Fractional outlines retain native Canvas2D antialiasing. Only eligible opaque integer-aligned rectangle runs use explicit WebGL instancing. Effects use the shared WebGL renderer. Vue updates, geometry, command preparation, decoding and transfers have their own costs. `translate3d` already moves the preview navigation surface; it cannot eliminate these costs. The separate [timeline measurements](timeline-scroll-2026-10-02.md) establish removal of static timeline repaints and immediate scroll coverage.

## Reproduction

Build into a fresh absolute directory outside the repository:

```sh
node scripts/performance/profile-preview-build.mjs "$PROFILE_BUILD"
BEAM_EDITOR_PROFILE_ROOT="$PROFILE_BUILD" \
BEAM_EDITOR_PROFILE_SOURCE="$PROJECT_COPY_SOURCE" \
BEAM_CAPTURE_ENGINE="$CAPTURE_BINARY" \
BEAM_EDITOR_PROFILE_OUTPUT="$PROFILE_RESULT" \
BEAM_PREVIEW_PROFILE_WORKLOAD=1 BEAM_PREVIEW_FRAME_PROFILE=1 \
node_modules/.bin/electron --ozone-platform=x11 scripts/performance/profile-editor.cjs
```

The harness suppresses window presentation and writes only its isolated copy and profiling output. On Linux, use a short writable `TMPDIR` outside `/tmp` if quota or Chromium socket-path limits apply. Profiling probes exist only in this temporary build; they are absent from shipped renderers.

```sh
BEAM_HEADLESS_TEST=1 bunx vitest run apps/cli/src/headless-render.integration.test.ts
```
