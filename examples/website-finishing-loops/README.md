# Beam — transitions and local export

Two eight-second, 1280 × 800, 60 fps website loops, each in light and dark. Both are intentionally silent and use unchanged native macOS cursor artwork, Beam's click spring/ripples, Hanken Grotesk and fixed native gradients: Aurora for transitions, Ember for export.

- **Keep the story moving:** select Slide left, adjust entry duration from 500 to 900 ms, try Zoom in and Blur, apply a canvas transition, then add independently editable native shape/text layers. The native transition compositor and timeline painters draw the actual preset behavior.
- **Finish with a file you own:** open export, select WebM then MP4, Maximum (4K), 60 fps and High quality. A progress bar leads to a local file. Encoding progress is an authored illustration, not an export-speed benchmark.

`src/TransitionInspector.vue` imports the desktop `TransitionSettingsPanel`. Its gallery is compacted only inside this isolated video surface; the build freezes its wall-clock hover previews so arbitrary seeks remain deterministic. The main canvas still renders Beam's real transitions at the authored time.

`src/ExportInspector.vue` composes the desktop Button, ButtonGroup and ProgressBar with the real export-preset bitrate calculation. The full desktop export popover owns backend IPC, preference writes and destination dialogs, so this illustration uses its native controls and options without triggering those operations. Lucide icons and native timeline surfaces are reused directly.

The GSAP root timeline is paused and registered at `window.__timelines`; `beamComposition.seek(ms)` updates Vue, native canvas painters and cursor geometry before resolving. The state resets while the editor is hidden; the fixed gradient never moves. No app or dev server starts from these scripts.

```sh
cd examples/website-finishing-loops
bun install
bun run build
bun run typecheck
bun run test --coverage
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify
bun run check

# Use an already running Beam instance; each demo opens its own project.
BEAM_INSTANCE=950580 bun run publish transitions dark
BEAM_INSTANCE=950580 bun run publish transitions light
BEAM_INSTANCE=950580 bun run publish export dark
BEAM_INSTANCE=950580 bun run publish export light

# Real Beam CLI render; optional GPU mode is host-dependent.
BEAM_CHROMIUM_GPU=hardware bun run render transitions dark
BEAM_CHROMIUM_GPU=hardware bun run render transitions light
BEAM_CHROMIUM_GPU=hardware bun run render export dark
BEAM_CHROMIUM_GPU=hardware bun run render export light

# Requires installed external FFmpeg; writes compact private-website media.
bun run website
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify:website
```

Master renders and compiled artifacts are ignored. The private website serves WebM derivatives with WebP posters, system-theme selection, pause and reduced-motion support. No FFmpeg binary or library is included in this example.

See `assets/NOTICE.md` for artwork/font provenance and `.media/index.md` for the adopted local media inventory. Source is MPL-2.0; original asset rights remain applicable.
