# Local rendering website loop

Eight-second English feature motion, 1280 × 800, 60 fps, silent. Shared light/dark
Beam palette. An authored workflow illustration: the typed `beam-cli motion
scene.json output.mp4` command feeds HTML through Beam and Mediabunny into a
locally saved MP4. Progress is choreography, never a benchmark.

`scene.json` represents a Beam motion job with entry, dimensions, duration and
fps; it is not an ordinary saved desktop project. Beam owns completed frame
rendering, Mediabunny owns the default encoder/container pipeline, and CLI owns
local disk publication. The animation does not imply the chosen AI model runs
locally. See `assets/NOTICE.md` for upstream sources and licenses.

```sh
bun install
bun run test
bun run typecheck
bun run build
bun run check
bun run verify
bun run dev
BEAM_CHROMIUM_GPU=hardware bun run render dark
BEAM_CHROMIUM_GPU=hardware bun run render light
bun run website
bun run verify:website
```

The commands above select a configured hardware WebGL backend. Omit
`BEAM_CHROMIUM_GPU=hardware` for the CLI’s portable software backend. Video
encoder hardware support is selected independently by Beam.

Masters and actual posters live in ignored `renders/`. `website` converts the
masters to VP9 WebM and WebP using external FFmpeg and writes the site's assets
and provenance notice. Shared FeatureAnimation controls pause, visibility,
system themes and reduced motion. Website proof uses localhost:7000 by default.
