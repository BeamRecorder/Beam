---
name: beam-recording
description: Record a real screen or capture a raw screenshot with Beam CLI's native Rust backend. Discover sources and permissions, construct supported capture configuration and inspect the actual result.
---

# Beam recording

Use this skill for acquiring real screen/window/region footage or a raw screenshot. Use `../beam-screenshot/SKILL.md` to compose/edit a still afterwards and `../beam-video-editor/SKILL.md` for a recorded timeline.

## Discover before capture

```sh
beam-cli capture capabilities
beam-cli capture discover
```

Inspect the actual returned sources, permission state and capabilities. Read [references/config.md](references/config.md) for supported native JSON shapes. Do not invent source IDs, assume every platform supports the same fields, or reuse an old monitor ID without discovery.

Ask for the intended window/region and system audio only if the request does not establish them. A request for a screenshot does not imply recording the whole desktop or starting an audio device. Make unavailable sources and denied permissions explicit. The native CLI configuration does not expose the desktop's separate microphone/webcam coordinator; do not invent those config fields.

## Capture

Save a validated native configuration as `capture-config.json`, using actual discovered source values:

```sh
beam-cli record capture-config.json 10
beam-cli screenshot screenshot-config.json capture.png
```

The config here is an input file populated from discovery, not a literal `{}` example to copy. `record` accepts a positive number of seconds up to 86,400. It prepares and starts capture, then stops/finalizes it after that duration; interruption triggers finalization rather than an invented success. Parse the returned session/artifact data to locate the actual recording.

`screenshot` writes a real PNG and reports native result data. The CLI stages the capture and protects an existing output unless `--overwrite` is supplied. Verify the returned dimensions and inspect the image before using it as artwork.

For multiple protocol operations in one process, `beam-cli capture serve` accepts JSON lines shaped as `{id, command, payload}`. Use commands and payloads from the current native protocol. Separate `capture` invocations do not keep a prepared recording process alive for subsequent `start`/`stop` calls; use `record` for a simple timed recording.

## Platform boundaries

Capture belongs to Rust, not HTML or browser `getDisplayMedia`. OS consent and source selection still apply. Linux capture uses the actual portal/PipeWire/native capability path; a headless video renderer does not grant permission to record a desktop. macOS and Windows native capture must be exercised on their actual platforms.

Use a clean desktop and intentional cursor movements when producing a demo. Record the real action with useful pauses; prefer removing dead time in editing over rushing the captured interaction. Preserve the original footage and inspect for accidental private content before producing the requested deliverable.

Do not promise automatic project opening, clipboard sharing or cloud upload from a raw capture command. Follow the returned data and the real tools available in the installed version.
