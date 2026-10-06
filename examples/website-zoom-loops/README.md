# Website zoom loops

Editable light/dark demonstrations for the 2D and 3D sections of `/features/zooms`.
Native Beam camera simulation, GPU perspective compositor, inspector controls and
timeline painter are driven by one deterministic eight-second GSAP clock.

```sh
bun install
bun run test --coverage
bun run typecheck
bun run build
bun run check
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run render 2d light
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run render 2d dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run render 3d light
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run render 3d dark
BEAM_WEBSITE_ROOT=/path/to/website-private bun run website
```

Beam's standalone motion CLI renders MP4 masters at 1280 × 800 / 60 fps without
opening the desktop app. External FFmpeg produces VP9 WebM and WebP derivatives.
The verifier checks forward/reverse seeking, visible geometry, separate camera
poses and matching loop endpoints in headless Chromium.

Art and font attribution is recorded in [assets/NOTICE.md](assets/NOTICE.md).
