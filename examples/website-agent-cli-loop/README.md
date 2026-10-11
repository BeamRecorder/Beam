# Beam CLI feature loop

Seven seconds, 1280 × 800, 60 fps, silent. A restrained English command
reference for `/features/ai-html#agents` in the private site, with matching
light/dark video and poster assets.

Three real commands type progressively within one stable terminal:

```sh
beam-cli tools list
beam-cli tools call documents.snapshot @project.json
beam-cli tools call documents.transact @edit.json
```

The first discovers tools and their schemas. `project.json` contains
`projectId` for an open project. `edit.json` contains that project ID, the
snapshot's `expectedRevision`, a unique `operationId`, and engine `commands`.
The captions explain live edits and undo; no CLI result data is invented.
This video illustrates commands; it does not execute edits on a user's project.

Sources are local Vue/TypeScript/GSAP, with original Beam theme tokens,
Lucide icons and fonts. See `assets/NOTICE.md` and the included licenses.
The deterministic character frontier is adapted from the inspected
HyperFrames `code-terminal-run` primitive; `shot-plan.json` and `design.md`
retain its design and timing. All code/assets work offline after installation.

## Rebuild from a Beam checkout

```sh
bun install
bun run test
bun run typecheck
bun run build
bun run check
bun run verify
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render dark
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome BEAM_CHROMIUM_GPU=hardware bun run render light
bun run website
node scripts/verify-website.mjs
```

Beam CLI `motion` renders both MP4 masters. External FFmpeg produces silent
VP9 WebM loops and WebP posters in `apps/website-private/public/`.
No desktop project, native capture service or user project is required.
`verify-website.mjs` expects the private site dev server on port 7000 (override
with `BEAM_WEBSITE_URL`). It checks both themes at desktop/mobile sizes,
manual pause and reduced motion.

Proof frames: 0, 0.6, 1.3, 2.2, 2.9, 4, 5.6 and 7 seconds.
`verify` compares full-frame pixel hashes and DOM poses after reverse seeks;
frame 0 and frame 7 are identical. Results are in `.beam/verification/`.
The pure seek/frontier module is tested at 100% statement/branch/function/line
coverage. HyperFrames checks retain the full contrast audit.
