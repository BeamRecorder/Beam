# Ai-Native — Edits Assistant

A 15-second announcement made in HTML/GSAP and rendered with **Beam CLI**. Genuine
Instagram interfaces move through one continuous camera sequence: oversized type,
3D phone rotations, close-ups, a photograph sweep and the official Edits identity.
The soundtrack mixes downloaded CC0 music with synchronized CC0 impacts; there is no voiceover.

Output: **1920 × 1080, 30 fps, MP4, stereo audio**.

## Files

- `index.html`: composition markup and official screenshot crops.
- `src/`: styles, one paused GSAP timeline and Beam's deterministic `seek(timeMs)` adapter.
- `references/`: frozen official logos/screenshots, fonts, sound effects and source records.
- `scripts/score.py`: reproducible CC0 music and effects mix; requires Python and FFmpeg.
- `scripts/render.mjs`: standalone Beam CLI render, without opening an editor.
- `scripts/publish.ts`: create/update the actual **Ai-Native** project in Beam Projects.
- `.beam/`: local project/layer identities and generated verification frames; ignored by Git.
- `dist/renders/Ai-Native.mp4`: final standalone render; ignored by Git.

## Install and render

From the repository root:

```sh
cd examples/ai-edits
bun install
bun run audio
bun run render
```

Beam's Chromium backend must be installed (`bun run beam browser install` from the
repository root). Alternatively, set `BEAM_CHROMIUM_EXECUTABLE` to a compatible
local Chrome executable. Rendering uses Beam's `create`, `edit` and `motion` commands,
including the full soundtrack. It does not start a development server.

## Publish to Beam Projects

Start Beam yourself, then run:

```sh
cd examples/ai-edits
bun run publish
```

The first run creates a video project named **Ai-Native**, opens a separate editor by
default and publishes the HTML layer plus soundtrack. Subsequent runs reuse the
remembered project/layer identities, preserve timeline placement and avoid opening
another window when the project is already ready. Source files and compiled assets
are frozen into the saved Beam project, so it remains usable after this folder moves.

With multiple running Beam processes, find their PIDs using `bun run beam tools call instances.list '{}'`
at the repository root, then use `BEAM_INSTANCE=12345 bun run publish`.
`bun run export` republishes and exports the live project. Keep Beam open until it finishes.

CLI project opening accepts `disposition: "reuse"` if you explicitly want to replace
the active editor. The default separate-window behavior applies in development and
installed releases.

## Edit and verify

Change editorial text in `index.html`, framing in `src/style.css`, and choreography
in `src/timeline.ts`. The timing grid is 32 beats over exactly 15 seconds. All moving
elements belong to the paused GSAP timeline; Beam owns playback and export time.

```sh
bun run typecheck
bun run test
bun run build
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify:frames
BEAM_CHROMIUM_GPU=hardware BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify:preview
```

The frame verifier uses an isolated browser with local assets and checks that seeking
backward produces identical pixels. Set `BEAM_CHROMIUM_EXECUTABLE` to the local browser
used by Beam CLI. Run it after building. It creates no listening development server.

The preview verifier mounts Beam's actual Vue HTML preview with the editor canvas
and its stacking styles. It checks delayed document registration, visible playback,
pause, reverse seeking, sandbox isolation and preservation of canvas selection.
It starts an isolated temporary asset server and closes it when finished.

The assistant is presented as a source of creative insight and audience analysis.
The film does not claim autonomous editing or guaranteed growth. See
[`references/SOURCES.md`](references/SOURCES.md) for announcement and media provenance.
