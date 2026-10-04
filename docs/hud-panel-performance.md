# Recorder Settings and Projects latency

Measured on Linux, 2026-10-03, using Electron 44.5.1, production renderer bundles and the X11 client backend on the same desktop session. The baseline was the panel manager and bundle from `c18e7262`; the updated bundle also includes the integrated master changes. These are application before/after measurements, rather than an isolated attribution to one function.

The benchmark uses real BrowserWindows, an always-on-top HUD, an isolated Chromium profile, French settings and 30 fixture projects with cached tiny thumbnails. It starts no capture engine and reads or changes no real project/preferences data. Software Chromium rendering was selected for both runs because accelerated rendering was unreliable in the profiling environment. Native window-manager stacking remains real. Three trials per panel were collected; filesystem caches were not cleared.

| Panel/action | Before median | After median | Before range | After range |
| --- | ---: | ---: | ---: | ---: |
| Settings, first request | 208.7 ms | 42.7 ms | 166.9–210.1 ms | 35.4–53.6 ms |
| Settings, reopen | 243.5 ms | 31.6 ms | 232.9–333.9 ms | 17.9–33.4 ms |
| Projects, first request | 180.4 ms | 35.5 ms | 160.1–238.1 ms | 29.1–72.5 ms |
| Projects, reopen | 189.2 ms | 72.1 ms | 168.0–241.3 ms | 59.6–108.4 ms |

Latency is measured from the open handler request until native presentation after the feature readiness signal. It excludes the subsequent 100 ms window-manager settling and content assertions. The first request in the updated run follows shell preparation: median preparation was 248.9 ms before the Settings trials and 215.9 ms before the Projects trials. Preparation can include both shells. The implementation moves this work after capture warmup and initial HUD presentation; it does not eliminate renderer initialization. An immediate click before preparation completes can still wait for that work.

All six updated trials reused their native window, mounted real feature content and placed the panel above the HUD in `_NET_CLIENT_LIST_STACKING`. All six baseline trials created a replacement on reopening and remained below the HUD. Closing an updated panel unmounts its feature and hides/demotes its retained shell. Unit tests separately cover preference changes, minimization, HUD hiding, renderer failure, readiness deadlines and application shutdown.

A repeat using the checked-in benchmark produced median first requests of 45.4 ms for Settings and 38.5 ms for Projects, with reopen medians of 31.2 ms and 54.9 ms. Native stacking, content, reuse and the installed Settings capability passed in all six repeat trials.

The reported 1–2 second delay was not reproduced by this production fixture. Development module compilation, real thumbnail generation, catalogue size and machine load can add latency. These results establish local improvement and correct Linux stacking, not a cross-platform latency guarantee. Windows/macOS integration is covered by targeted mocks and needs native GUI verification on those systems.

## Reproduce

Build the renderer, then run the isolated benchmark:

```sh
bunx vite build
BEAM_PANEL_SOFTWARE=1 BEAM_PANEL_OUTPUT=/tmp/beam-panels-after.json node_modules/.bin/electron --no-sandbox --ozone-platform=x11 scripts/performance/hud-panels.cjs
```

For a before/after comparison, retain the previous `dist/` directory and panel manager source before updating. Supply their absolute locations with `BEAM_PANEL_DIST` and `BEAM_PANEL_BASELINE` for the baseline run. The saved manager is compiled at its original module location so its existing relative dependencies resolve correctly. `xprop` and an X11/XWayland display are required. The `--ozone-platform=x11` argument must be present on the initial Electron command line; appending it inside the main script is too late to reliably select the backend.

The benchmark sets the panel manager's packaged flag to load the built bundle and exercise the installed Settings capability, while the Electron application remains unpackaged. It does not initialize OS startup integration or register login items.
