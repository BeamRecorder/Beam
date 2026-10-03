# Desktop window performance audit — 2026-09-30

## Scope and fixes

- Projects starts at 720 × 560, with a 560 × 440 minimum. Its cards remain square: 222 × 222 at the default size and 257 × 257 at the minimum. Resizing updates the virtual row height and preserves the first visible project. No horizontal overflow was observed at either size.
- The selected Settings, Projects or Mascot Lab module starts loading alongside its language and saved appearance. Other panel modules stay unloaded. All window bootstraps share concurrent locale/theme preparation, and mount only when both are ready.
- Projects imports its video decoder only when a visible project lacks a thumbnail. One decoder runs at a time; scrolled-out projects leave the pending queue. Explicit refresh retries failed visible thumbnails, and unmount stops further work. Existing media disposal and the ten-second decoding deadline remain in place.
- Camera and Quick Snip crop controls use a direct renderer bootstrap, retaining their existing native URLs, component notifications and capture APIs. They no longer initialize the HUD, its recorder controller or unrelated HUD subscriptions. The editor no longer installs the unused Motion plugin, and loads its video module alongside project editor data.
- Initial countdown/teleprompter preparation waits for native HUD presentation and completion of capability discovery. Explicit requests still prepare immediately. A pending initial warmup is canceled when its owner dies and skipped if the HUD has since hidden. Hidden auxiliary rendering remains unthrottled; idle panel rendering retains Chromium's normal throttling.
- Countdown presentation waits for both native loading and the mounted component's subscriptions, accepting only its owning renderer. This fixes the race where the first value arrived before its listener.

## Measurements

These are local measurements with Electron 44.5.1 on Linux/X11, production bundles and the same native capture binary. The baseline is a disposable snapshot of the existing feature work before these optimizations, not an older released version. Each launch creates a fresh Electron process and Chromium/user profile. OS file caches are **not** cleared, and timing starts at the JavaScript main entry, excluding OS process launch. Camera, microphone and system audio are disabled; no recording is started. Tests, type checks and builds were stopped during measurement.

The full application comparison uses three alternating before/after launches and one empty Studio fixture project. The standalone panel comparison uses three alternating application launches per version, each opening three fresh renderers per role with a thirty-project fixture library. [Raw samples](performance/window-audit-2026-09-30.json) include every trial in those comparisons.

| Median full-application elapsed time | Before | After |
| --- | ---: | ---: |
| HUD first native show | 942 ms | 579 ms |
| HUD mounted | 1,048 ms | 678 ms |
| Capture discovery available | 1,080 ms | 1,352 ms |
| Open Settings | 331 ms | 294 ms |
| Open Projects | 245 ms | 320 ms |
| Open Mascot Lab | 311 ms | 336 ms |
| Show prepared teleprompter | 2 ms | 2 ms |
| Show countdown | 18 ms | 11 ms |
| Open Studio | 482 ms | 463 ms |
| Studio → HUD | 67 ms | 57 ms |
| Open region selector, excluding Portal/desktop preview | 188 ms | 183 ms |

| Median isolated shell/panel readiness | Before | After |
| --- | ---: | ---: |
| Projects, nine native openings with thirty projects | 288 ms | 273 ms |
| Settings, nine native openings | 191 ms | 197 ms |
| Camera shell, three openings with camera disabled and fixture IPC | 245 ms | 167 ms |
| Quick Snip controls, three openings with fixture IPC | 243 ms | 178 ms |

Native results are noisy and do **not** establish a general speedup for every window. Capture readiness ranged from 836–1,197 ms before and 891–1,462 ms after; its median is worse in this series. Native encoder probing remains the main capture-readiness cost, and no capture-readiness improvement is claimed. Other alternating launch series showed smaller HUD gains and broad overlapping timing ranges, so the 942 → 579 ms result is not a startup guarantee. Countdown now also includes the listener-readiness check. Closing an editor suspends its auxiliary windows, so returning to the HUD includes their recreation. Keep these measurements separate from appearance of the startup mascot.

A separate Chrome trace against the warm Vite server with French and thirty saved-thumbnail fixtures isolated the panel import chain: Projects renderer readiness changed from 828 to 415 ms, LCP from 1,003 to 526 ms, with CLS 0. The selected view and French locale requests now overlap, and no Mediabunny request occurs for saved-thumbnail projects. These are **renderer-only development measurements**, not native cold opening times.

The region trial exercises the real native selector through Quick Snip and cancels it, excluding human Portal selection and native magnifier PNG capture. Camera first-frame/device startup, recording, screenshot/export job windows and marker placement were not hardware-benchmarked. Their capture ownership and native readiness paths remain unchanged. Windows/macOS and a real OS cold boot require measurements on those environments.

## Reproduce and inspect

Build the normal desktop bundle first, then run the isolated full-application profiler:

```sh
bun run build
BEAM_WINDOW_PROFILE_OUTPUT=/tmp/beam-window-profile.json \
  bunx electron scripts/performance/profile-windows.cjs --ozone-platform=x11
```

The profiler resolves the local debug capture binary from Cargo's target directory; set `BEAM_CAPTURE_ENGINE` to use a specific prebuilt binary. `BEAM_WINDOW_PROFILE_ROOT` can select a disposable baseline tree with its own `dist/` and Electron modules. The JSON records window creation/loading/presentation, IPC durations, native requests and each transition. User data, preferences and the empty fixture project live in a new temporary directory, reported in the output; existing projects are untouched.

For renderer traces, use the [startup marks and developer-tools procedure](recorder-performance.md#inspecting-a-launch). Compare production bundles for native timings. Follow Electron's [performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance) and distinguish module loading, native window creation, first paint, component readiness and actual capture readiness.
