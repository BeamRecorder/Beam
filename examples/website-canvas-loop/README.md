# Make it unmistakably yours

A seven-second HTML/Vue/GSAP loop for Edit's Canvas section, rendered by Beam CLI.
A native macOS pointer clicks two real image backgrounds, then Video, Color and
Gradient. The same Beautiful Captures artwork stays in Beam's actual Safari frame.
Beam's cursor spring/ripple functions, background presets, palette, buttons,
CanvasBackgroundTabs, AddTileButton, Slider and runtime painters are imported
directly. The animated wallpaper is decoded with Mediabunny under the seek clock.
The background/cursor/camera return to their exact initial state at seven seconds.

```sh
bun install --cwd examples/website-canvas-loop --frozen-lockfile
bun run --cwd examples/website-canvas-loop build
bun run --cwd examples/website-canvas-loop test --coverage
bunx vue-tsc -p examples/website-canvas-loop/tsconfig.json --noEmit
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-canvas-loop verify
bun run --cwd examples/website-canvas-loop check
```

With Beam already running, publish to independent editor windows:

```sh
bun run --cwd examples/website-canvas-loop publish dark
bun run --cwd examples/website-canvas-loop publish light
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-canvas-loop render dark
BEAM_CHROMIUM_GPU=hardware bun run --cwd examples/website-canvas-loop render light
bun run --cwd examples/website-canvas-loop website
```

The render uses a standalone Beam motion job at 60 fps. Externally installed
ffmpeg creates VP9/WebP website derivatives; it is never bundled here. `BEAM_INSTANCE`
selects an existing Beam PID. `verify:website` checks the already-running port 7000
website; no development or preview server is started by these scripts.

Change `src/motion.ts` for gestures/timing, `src/catalog.ts` for library selection
and `src/preview.ts` for framing. Building requires the Beam checkout, including
the shared fixed gradient in the timeline example. All resources are frozen into
the compiled publish bundle; source references accompany the project.

Code: MPL-2.0. See [asset notices](assets/NOTICE.md) for existing third-party rights.

Validation covers both themes, all eight pointer targets, advancing video frames,
reverse seeks and a pixel-identical loop seam. HyperFrames checks runtime, layout,
motion and contrast. Its generic negative-z-index warning concerns Beam's native
selection track, whose parent already has `isolation: isolate`; the rendered
selected tabs are verified. Native cursor overlap during a click is intentional.
