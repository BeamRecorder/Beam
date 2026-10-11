---
name: beam-screenshot
description: Create and edit Beam Screenshot documents with native image/text layers, framing, backgrounds and supported effects, then export real PNG or WebP. Use for still compositions and frame-derived image editing.
---

# Beam Screenshot

For new visual work, read `../beam-design/SKILL.md` and establish missing design/frame decisions. For live changes, read `../beam-cli/references/authoring.md`. A Screenshot is a static `StillDocument`, not a video timeline.

## Choose the starting document

- Open an existing image project through `projects.list` / `projects.open` and read `documents.snapshot`.
- Create a transparent canvas through `projects.create` with `kind: "image"`, width and height; open the returned project before editing.
- Capture a real source using `../beam-recording/SKILL.md`.
- Standalone: `beam-cli create image source.png WIDTH HEIGHT image.json`. Supply the image's actual pixel dimensions.
- Extract a video frame with `beam-cli frame REQUEST.json TIME_MS frame.png`; save the returned editable still document if further edits are needed.

An empty transparent canvas has no source image layer. Do not patch `layerId: "image"` until the actual snapshot shows that layer exists.

## Compose with the real layer system

Read `beam-cli docs commands` and the snapshot's state before editing. Native still commands include:

| Intent | Command |
| --- | --- |
| Add image, text/shape, blur or static cursor | `still.layer.add` |
| Modify supported layer content/geometry | `still.layer.patch` |
| Set saved inspector name without changing rendered text | `still.layer.rename` |
| Visibility, stacking, deletion | `still.layer.enable`, `.reorder`, `.delete` |
| Opacity, blend, lock and attached effects | `still.layer.compositing` |
| Canvas, background and output settings | `still.canvas.set`, `still.background.set`, `still.settings.patch` |

Use native text when the user should be able to edit it later. Import the font with `fonts.import` and retain both its returned family and asset ID; follow `../beam-assets/SKILL.md`.

Importing an image with `assets.import` does not insert a layer. Follow the returned image metadata and the installed `still.layer.add` schema. Arrange layers from the actual composition order, preserve masks/alpha and keep locked content unchanged.

## Effects and HTML

Read `beam-cli docs gradients` for attached effect recipes and their supported layer kinds/limits. Apply actual validated Color/Gradient/effect recipes, not invented filters or UI labels. Check transparent edges in a rendered PNG; a background fill that hides alpha loss is not a valid check.

For complex artwork, use `../beam-composition/SKILL.md` to publish HTML with `durationMs: 0`. It retains source and a real rendered PNG derivative. Native text can remain a separate editable layer above it. Still documents reject animation commands.

## Export and review

Live: `render.export` uses the target image project and a `.png` or `.webp` output path. The tool's `format` field is for video formats; do not pass `format: "png"` to that tool. Standalone: `beam-cli export image.json output.png` or `output.webp`.

Review the actual output at delivery size, especially crop, text legibility, edge transparency and composition order. Retain editable source alongside the exported image. Use `../beam-export/SKILL.md` for verification and output protection.
