---
name: beam-cli
description: Use Beam CLI to capture screens, edit Beam projects, publish HTML artwork and render video or screenshots. Discover the real tools and route to the relevant Beam skill; use for Beam workflows, not unrelated website development.
---

# Beam CLI

Beam combines native screen capture, editable video/screenshot documents and deterministic HTML compositions. Use its actual document tools instead of recreating the editor or assuming HyperFrames/Remotion conventions.

## Start with the requested operation

- A question or an idea is a discussion, not authorization to modify a project.
- For an existing project, inspect the document and preserve unrelated clips, effects, source files and user edits.
- For new visual work, read `../beam-design/SKILL.md`. If design direction is missing, ask focused questions before inventing it. Do not force a new interview for a concrete edit with an established design.

Discover the installed CLI, then read its bundled instructions:

```sh
beam-cli --help
beam-cli tools list
beam-cli docs agent
beam-cli instances
```

In a Beam source checkout, use `bun run beam` instead of `beam-cli`. Installed Linux also accepts `beam --cli`; Windows has `beam-cli.cmd`. These are the same command interface, not an npm package to guess or install.

Use `beam-cli skills check` when diagnosing stale or missing guidance. `skills update` retrieves the maintained pack from `BeamRecorder/Beam/.skills/Beam-cli`. Match the installed CLI's bundled tool schemas when repository instructions differ. A failed network check means freshness is unknown; it is not evidence that the installed skills are outdated.

## Load only the skills needed

Sibling paths are relative to this installed skill's parent directory.

| Task | Read |
| --- | --- |
| Brief, visual direction, `design.md` / `frame.md` | `../beam-design/SKILL.md` |
| HTML/TypeScript, optional Vue, live publication | `../beam-composition/SKILL.md` |
| Motion, timing, seek-safe GSAP or native tracks | `../beam-animation/SKILL.md` |
| Screen recording, source discovery, raw screenshots | `../beam-recording/SKILL.md` |
| Screenshot layout, text, layers and effects | `../beam-screenshot/SKILL.md` |
| Video timeline, cuts, captions, zooms and lenses | `../beam-video-editor/SKILL.md` |
| Imported media, fonts and source references | `../beam-assets/SKILL.md` |
| Audio clips, gain, fades and sound timing | `../beam-audio/SKILL.md` |
| Frame review, PNG/WebP and MP4/WebM deliverables | `../beam-export/SKILL.md` |

## Desktop editing and standalone rendering

Live `tools call` authoring requires a running Beam desktop instance and an open target editor. `projects.create` creates a saved project; `projects.open` opens it. Inspect `projects.list` first to reuse an already open editor. When several instances exist, pass `--instance PID` at the end of live commands.

Standalone `create`, `inspect`, `commands`, `edit` and `serve` do not need the desktop. `motion`, `frame` and `export` need Beam's Chromium backend, installed with `beam-cli browser install` or configured with `BEAM_CHROMIUM_EXECUTABLE`. Capture uses the native Rust engine and real OS permissions.

Read [references/authoring.md](references/authoring.md) before changing a live document. It contains revision, retry, lock and file-output rules shared by all Beam skills.

Successful results are JSON on stdout. Errors are JSON on stderr with a nonzero exit status. Parse the returned data; never turn a failed operation into a claimed export or success.
