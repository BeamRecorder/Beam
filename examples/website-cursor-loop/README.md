# A cursor that feels considered

Twelve-second, seamless, silent loop for the private site's Edit / Cursor detail.
One stable view showcases the full native macOS and Material Bibata Noir packs:
35 macOS artworks and 54 distinct Bibata artworks covering all 84 aliases. Large
role previews accompany point/click, text, move, resize, selection, locked and help
interactions. Beam's engine evaluates movement, original hotspots, click spring,
motion blur and single/double rings. Tide is painted once by the actual gradient
renderer. All artwork is preloaded, with no network dependencies. Both themes
are rendered at 60 fps. Original dark artwork stays readable on a light native
presentation surface; inspector and titlebar follow the delivery theme. The
inspector pointer retains its native macOS appearance.

```sh
bun install
bun run build
bun run typecheck
bun run test --coverage
bun run check
BEAM_CHROMIUM_EXECUTABLE=/path/to/chromium bun run verify
bun run publish dark
bun run publish light
BEAM_CHROMIUM_EXECUTABLE=/path/to/chromium bun run render dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chromium bun run render light
bun run website
```

Publish uses the already-running Beam instance and independent projects. Render
uses the Beam CLI at 1280 × 800 / 60 fps without starting an editor or dev server.
Keep this directory inside the Beam checkout: native component imports and
artwork from the adjacent examples are intentional, rather than copied UI.
Source and original-asset provenance ship in the project reference bundle.
Native SVG/PNG cursors retain their applicable rights; see `assets/NOTICE.md`.
Generated masters, proof frames and profiles are ignored by Git. The website's
shared player handles system theme, viewport suspension, pause and reduced motion.

When multiple instances are open, set `BEAM_INSTANCE` to a PID returned by
`bun ../../apps/cli/src/index.ts instances` before running `publish`.
