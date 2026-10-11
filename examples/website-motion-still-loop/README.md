# Motion or still. The same source.

Seven-second, silent 60 fps loop for the private site's AI feature frames
section. Original Beam colors, local fonts and matching light/dark variants.
One authored HTML composition appears moving in Studio and as an actual PNG
in Screenshot. Labels explain MP4 / WebM and PNG / WebP exports.

The orange orbit briefly holds at 2.4 seconds while its frozen PNG is
highlighted, then continues. The PNG stays unchanged throughout the loop.
`src/Artwork.vue` and `src/motion.ts` are shared by the standalone
`artwork/scene.html` and the presentation. The PNGs in `assets/` are actual
1280 × 800 captures of frame 144 from Beam CLI's HTML frame renderer.
The labels illustrate export destinations; this does not edit user projects.

## Rebuild in a Beam checkout

```sh
bun install
bun run test
bun run typecheck
bun run build:artwork
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run stills
bun run build
bun run check
bun run verify
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render light
bun run website
node scripts/verify-website.mjs
```

Recapture both PNGs after changing the artwork/timeline, then rebuild the
presentation. The capture script reuses Beam CLI's `buildMotionBundle`,
`serveRenderBundle` and `createMotionPage`. Both full movies render through
Beam CLI `motion`; external FFmpeg creates VP9 WebM loops and WebP posters.
Nothing is fetched or generated during playback.

`verify` inspects both themes at 0, 0.9, 2.4, 2.7, 4.2, 5.6, 6.75 and 7
seconds, compares reverse-seek pixel hashes/DOM poses, checks the moving
output and constant PNG, and compares PNG pixels to a fresh seek of the
actual source. Frame 0 and frame 7 are identical. Proof/report files are in
`.beam/verification/`. Full HyperFrames contrast checks stay enabled.

`verify-website.mjs` expects the site on port 7000 (override
`BEAM_WEBSITE_URL`). It checks themed playback, desktop/mobile fit, manual
pause and reduced motion. Source clock/frame/timecode tests have 100%
statement, branch, function and line coverage.

See `assets/NOTICE.md` and bundled licenses. The inspected registry
`split-tilt-cards` structure is adapted to flat 2D with real slot content;
glows, 3D tilts, idle floats and badges are removed for the minimal brief.
Design and timing are recorded in `BRIEF.md`, `design.md` and `shot-plan.json`.
