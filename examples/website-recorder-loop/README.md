# Your screen, your framing

A silent 12-second, 1280 × 800, 60 fps Beam HTML/Vue/GSAP composition.
Imports Beam's real `RecorderBar.vue`, `HudCaptureCards`, `CaptureModeGroup`,
`BrandLogo`, Buttons, Selects and theme styles. The existing Beautiful Captures
pointer clicks Full screen, Region, Window and the three capture modes, then
pauses, resumes and stops the real recording controls. A gentle 2D camera move
returns to its initial pose, including the pointer and every visible control.

```sh
bun install --cwd examples/website-recorder-loop --frozen-lockfile
bun run --cwd examples/website-recorder-loop build
bun run --cwd examples/website-recorder-loop test --coverage
bunx vue-tsc -p examples/website-recorder-loop/tsconfig.json --noEmit
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-recorder-loop verify
BEAM_INSTANCE=PID bun run --cwd examples/website-recorder-loop publish dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-recorder-loop render dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-recorder-loop render light
BEAM_WEBSITE_ROOT=/path/to/website-private bun run --cwd examples/website-recorder-loop website
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-recorder-loop verify:website
```

`publish` creates an independent editable Beam project. `render` uses Beam CLI's
motion exporter. Website derivatives use an externally installed FFmpeg with VP9
and WebP support. The website path is explicit because it is a separate private
repository. Generated bundles, local project IDs and full-resolution MP4s are
ignored. Both themed videos and posters belong in the private website repository.

The scene is an authored product demonstration, with devices intentionally Off;
it does not record or discover native sources. `verify` checks actual DOM hit
targets, both palettes, recording state, backwards seeks and identical loop-seam
pixels. See [asset provenance](assets/NOTICE.md).

HyperFrames also validates runtime, layout and text contrast. Its two static
negative-z-index warnings concern Beam's existing isolated selection/popover
surfaces; the visible selections are covered by the DOM and pixel verification.
