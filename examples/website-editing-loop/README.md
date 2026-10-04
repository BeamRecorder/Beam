# Shape the pace

A five-second, 60 fps HTML/GSAP loop for the Edit feature's timeline panel. The
native macOS cursor trims the first screen clip, then brings the next clip and its title
against that edge. The layout and cursor return smoothly to their opening state.
The fixed background uses Beam's Ember preset and actual gradient renderer,
painted once into a bitmap outside the animated camera.

The actual macOS arrow changes to the native horizontal-resize cursor when it
hovers the trim handle, stays in that role during the drag, then returns to the
arrow when leaving the edge. Both SVGs preload and use Beam's pack geometry and
hotspots, so the interaction point stays aligned when the cursor changes.

The fictional data is rendered with **Beam's real `paintTimelineCanvas`, theme
CSS, `TimelineTrimHandle.vue` and `Button.vue`**, imported directly from the
repository. The preview and thumbnails come from the user's Beautiful Captures
Screenshot project, exported with the Beam CLI. See [asset notices](assets/NOTICE.md).

```sh
bun install --cwd examples/website-editing-loop --frozen-lockfile
bun run --cwd examples/website-editing-loop build
bun run --cwd examples/website-editing-loop test
bunx vue-tsc -p examples/website-editing-loop/tsconfig.json --noEmit
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run --cwd examples/website-editing-loop verify
bun run --cwd examples/website-editing-loop check
```

Beam must already be running. Publish each theme into its own editor; this does
not replace the user's current Screenshot or video project:

```sh
bun run --cwd examples/website-editing-loop publish dark
bun run --cwd examples/website-editing-loop publish light
bun run --cwd examples/website-editing-loop render dark
bun run --cwd examples/website-editing-loop render light
bun run --cwd examples/website-editing-loop website
```

`BEAM_INSTANCE` optionally selects a discovered Beam PID. `.beam/` remembers the
project and layer IDs, so republishing updates that same source layer. The project
keeps the compiled, self-contained component bundle and authored source references.
Building requires this checkout because the real components live in Beam.

The standalone Beam motion export uses 60 fps; the open editor's project settings
are preserved. For a GPU-capable machine, set `BEAM_CHROMIUM_GPU=hardware` on the
render command. The existing CLI defaults to its portable software backend.

`window.beamComposition.seek(timeMs)` and the paused HyperFrames timeline share
one GSAP clock. No autonomous timer, network or random input drives the shot.
Verification saves nine proof frames per theme, checks reverse seeks and asserts
pixel-identical frames at 0 and 5000 ms. Changing `src/motion.ts` customizes the
gestures; `src/timeline-model.ts` owns the illustrative clips.

The final `website` command uses an externally installed ffmpeg to optimize the
rendered MP4s to VP9 and posters to WebP. It copies those derivatives into the
private website; ffmpeg is not included in the example or application.

With the website already running on port 7000, `verify:website` checks actual
video playback and pause in both themes, live theme changes, and reduced motion.
It saves page screenshots under `.beam/website-verification/`. It never starts a
development server. Set `BEAM_WEBSITE_URL` for a different existing server.

The website assets are silent VP9 WebM files with WebP posters. The player starts
only while visible, honors reduced motion, offers pause, and follows the system
theme. The source is MPL-2.0; dependency and asset licenses remain unchanged.
