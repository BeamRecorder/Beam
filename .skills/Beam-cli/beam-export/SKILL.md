---
name: beam-export
description: Review and export Beam videos, screenshots and HTML motion to real MP4, WebM, PNG or WebP files. Select live or standalone rendering, protect output files and verify visual/audio results.
---

# Beam export

Choose the delivery dimensions, duration, format and transparency from the user's brief. If those materially affect an unresolved new design, use `../beam-design/SKILL.md`. Do not add an approval round when the export is already requested.

## Live editor

Read `tools describe render.frame` and `tools describe render.export`. Use the actual open project ID:

```json
{"projectId":"PROJECT_UUID","timeMs":2000,"output":"./review.png"}
```

```sh
beam-cli tools call render.frame @frame.json
```

`render.frame` captures a video timeline frame as PNG. For an image project, export PNG/WebP directly. Example video export arguments:

```json
{"projectId":"PROJECT_UUID","output":"./demo.mp4","format":"mp4","preset":"high"}
```

```sh
beam-cli tools call render.export @export.json
```

For Screenshot, choose `.png` or `.webp` via the output path and omit `format`; that field accepts only `mp4`/`webm`. Respect existing files unless replacement is intended; `overwrite: true` is explicit.

## Standalone renderer

```sh
beam-cli browser install
beam-cli motion job.json demo.mp4
beam-cli export request.json demo.webm
beam-cli frame request.json 2000 review.png
beam-cli export image.json composition.png
```

Install the browser only when missing, not on every render. `BEAM_CHROMIUM_EXECUTABLE` may select an existing compatible browser. Standalone motion job structure lives in `../beam-composition/references/publish.md`.

A video render needs a complete export snapshot and resolvable assets. A saved desktop project alone may not contain that full render request. Prefer live `render.export` for an open desktop project instead of guessing missing session state. Resolve `project-media:`/`blob:` resources before standalone export.

The default backend is WebCodecs, independent of desktop preferences. `--backend ffmpeg-vaapi` is experimental Linux GPU export requiring a compatible X11/XWayland display, drivers, native artifacts and external matching FFmpeg libraries. It is not a portable speed switch. Default headless software rendering does not require a desktop display.

## Review and deliver

Inspect the actual exported files, not only a browser preview:

- First visible frame, representative holds, transition midpoints and last valid frame.
- Text fit at delivery size, crisp UI, aspect/crop, expected layers, alpha/edges and no missing resources.
- For video, real duration, dimensions, frame rate and audio playback/stream presence.
- For animation, repeated/reverse seeks at the same time produce the same state.

Use an available image viewer and video/metadata tools. If they are unavailable, report the exact verification limit. Do not say a video is visually verified because a file exists or a renderer returned success.

Return the output path and retain the editable document/HTML source. Report failures honestly; never replace a failed render with a placeholder and describe it as finished. Uploading or publishing is a separate action requiring authorization from the user's task.
