---
name: beam-video-editor
description: Edit real Beam video documents using timeline commands, native text, presentation settings, captions, zooms and lenses. Preserve source timing, locks and edit history while producing a clear, concise demo.
---

# Beam video editor

Read `../beam-cli/references/authoring.md` before a live edit. For a new piece without visual direction, use `../beam-design/SKILL.md`; for motion or HTML, add `../beam-animation/SKILL.md` and `../beam-composition/SKILL.md` only when needed.

## Inspect before changing

Read the actual video snapshot: assets, clips, tracks, source/timeline intervals, enabled states, locks, scenes, animation tracks, zooms and render settings. Determine which recording contains the requested action. Do not replace an existing edit with a newly fabricated document.

Standalone `inspect` accepts saved project/composition/export-request JSON. `edit INPUT COMMANDS.json OUTPUT` applies a command array to a separate output; it does not modify an already open editor. A project JSON alone may not contain all render settings and resolved session media needed for export.

## Timeline changes

Use `beam-cli commands` and `beam-cli docs commands`. Common payloads:

```json
[
  {"type":"clip.move","payload":{"clipId":"CLIP_ID","startMs":0}},
  {"type":"clip.trim","payload":{"clipId":"CLIP_ID","edge":"end","timeMs":4000}},
  {"type":"clip.rate","payload":{"clipId":"CLIP_ID","rate":1.25}}
]
```

These values demonstrate command shape; derive real timings from the source and snapshot. Times are milliseconds. Split, trim and playback-rate changes affect source mapping; inspect the resulting intervals rather than subtracting seconds blindly. Do not speed up narration until it becomes unintelligible.

`clip.add` requires a complete valid clip; there is no generic `clip.insert` command supplying defaults. `asset.add` likewise needs complete metadata. `assets.import` copies media into the project but does not create a timeline clip. Use `../beam-assets/SKILL.md` for media/font handling.

Use native text clips for editable titles and labels. Preserve existing text style and imported font metadata. Scene groups and animation tracks use the engine schema; read it before creating a new graph.

## Presentation, zooms and lenses

Live `render.patch` supports `canvas`, `background`, `blurPercent`, `zooms`, `zoomMotionBlur` and `zoomAutoFollow`. Read the current value and change the supported field, retaining everything outside the requested scope. Recorded cursor data, font resources, cursor packs and render metadata are host-owned, not arbitrary patch targets.

Use 2D focus, 3D perspective or glass lenses to explain a real action. Keep UI text readable and the focus inside useful source bounds. Read actual zoom/loupe records from the snapshot and installed docs; do not invent a CLI `zoom.add` command because the editor has an Add action. Regeneration can replace auto-generated zoom/loupe placement; preserve manual work and locks.

Captions use real timed words/segments and native document commands. Beam's current local Whisper transcription UI exports JSON; do not promise SRT/VTT output or invent a transcription CLI tool. The CLI tool catalog is the authority for what an agent can invoke directly.

For audio, use `../beam-audio/SKILL.md`. HTML media is muted in live HTML preview; place audible media on the Beam timeline when building a composition.

## Review

Remove waiting time while keeping the action understandable. Check continuity around every trim/cut, text readability, cursor emphasis, audio alignment and final duration. Render representative frames and an actual video using `../beam-export/SKILL.md`; a valid transaction alone does not prove the edit looks right.
