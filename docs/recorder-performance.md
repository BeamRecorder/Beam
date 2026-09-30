# Recorder startup performance

## Changes

- The recorder's HTML contains a static SVG export of the Mascot Lab cloud. A small CSS animation dances and squashes the cloud while the application imports. It requires no Vue, font download or JavaScript animation engine. The shell disappears on the first frame after mounting; there is no minimum display time. Reduced motion disables both animations.
- English remains bundled for translation fallback. Other languages load as separate core/editor chunks when selected, with deduplication, caching and protection against an earlier request overriding a later selection. Each renderer awaits its initial language before mounting. Previously, all 15 languages were included in every renderer's initial translation module: about 1.05 MB of source JSON.
- Recorder controls and the screen-region overlay load on demand. The HUD no longer installs the unused global Motion plugin; onboarding retains its directives.
- Electron imports `fontkit` only when importing a font, and `@xmldom/xmldom` only when validating an SVG. Existing validation limits remain in place.
- The desktop bundle no longer includes Vite's module-preload polyfill: Electron's Chromium supports module preload. Website bundling remains independently configured.
- The frameless application no longer creates Electron's default application menu. Explicit tray and context menus remain available.

The camera, region, crop and teleprompter overlays remove the startup shell before loading their Vue application, keeping the desktop transparent. Before Vue is available, an import failure displays plain error text and a native HTML reload button. The shell shares the full renderer's palette and surface tokens.

## Measurements

Measured on 2026-09-30 using production bundles, Electron 44.5.1 and three alternating launches of each implementation. The baseline restores the earlier eager imports in a disposable copy while keeping the same dependency versions and feature work. Both implementations use isolated temporary user/Chromium profiles and the same native capture engine; no recording is started. The JavaScript suites had finished before these trials. OS file caches were not cleared.

| Measurement, median | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Main-process module loading | 146 ms | 79 ms | 46% |
| Native HUD first show, from main entry | 821 ms | 727 ms | 11% |
| First contentful paint, from renderer navigation | 528 ms | 372 ms | 30% |

Native first-show results ranged from 751–1,048 ms before and 653–774 ms after. First contentful paint now includes the startup cloud; it is **not** a measurement of capture readiness or completion of the full HUD. Main-entry timing excludes the OS launching Electron itself. A separate French-language launch rendered the translated HUD successfully.

These trials use Linux/X11 and software rendering because the GPU process crashes in this test environment with both Electron 43 and 44. Hardware acceleration remains enabled in the application. Windows/macOS rendering and native recording/export performance require checks on those platforms. These results are local comparisons, not a startup-time guarantee.

## Inspecting a launch

Start the normal development server, then enable the recorder's detached developer tools:

```sh
bun run dev
# In another terminal:
BEAM_DEVTOOLS=1 bun run electron:dev
```

In the recorder's **Performance** panel, record a page reload and inspect the **Timings** track. The bootstrap marks are:

- `beam:bootstrap-start`: the lightweight bootstrap script begins executing.
- `beam:renderer-mounted`: the first animation-frame callback after Vue mounts and the selected language is initialized.
- `beam:renderer-bootstrap`: the interval between those marks, including deferred application imports and language initialization.

The latest measurement is also available in the Console:

```js
performance.getEntriesByName('beam:renderer-bootstrap').at(-1)?.toJSON()
```

Use the **Network** panel to check which chunks are requested initially and which appear only when recording, selecting a region or changing language. Profile a packaged/local production bundle when comparing performance; Vite development transforms and open developer tools change the timing. The native terminal logs now start before the main process loads its modules and separately report app readiness, navigation, DOM readiness, first show and load completion. Reloading the renderer does not repeat main-process startup.

Necessary capture initialization, permission policies, IPC registration and preference repair retain their ordering. Auxiliary countdown/teleprompter preparation runs alongside HUD presentation under the existing window-lifecycle contract. This change does not postpone capture correctness work just to improve a timing marker.

See the [Electron performance checklist](https://www.electronjs.org/docs/latest/tutorial/performance) for the profiling and deferred-loading guidance used in this audit.
