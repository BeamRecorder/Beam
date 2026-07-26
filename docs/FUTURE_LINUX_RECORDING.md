# Linux screen recording and semantic cursor plan

Status: deferred. This document records the agreed approach before Linux native
capture work resumes. Audio, microphone, and camera remain Electron-owned
browser sidecars; this work concerns only native screen video and cursor data.

## Goal

Provide native Linux screen and window recording with a separately recorded,
portable cursor track. Integrate it with the existing Rust capture engine's
source discovery, tracks, segments, timing, pause/resume, recovery, health,
and manifest lifecycle.

The renderer must never use Linux native APIs directly. Electron continues to
communicate with the engine through the existing narrow JSON-lines protocol.

## Supported paths

### X11

Use `x11rb` with the XFixes and XInput2 extensions.

- Discover monitors and windows through X11.
- Capture a selected monitor or window into the native screen track.
- Obtain pointer position from X11 pointer queries/events.
- Use `XFixesGetCursorImage` and `CursorNotify` for hotspot and cursor serial.
- Use XInput2 pointer-button events for press/release state.
- Convert the XFixes serial to `nativeCursorId: "x11:<serial>"`.

X11 does not provide a reliable, portable name for every cursor theme shape.
Only classify a shape when a rule is explicit and safe. Otherwise record
`cursorKind: "custom"`; never infer an icon from its pixels.

### Wayland

Wayland never permits arbitrary direct desktop capture. Use the XDG Desktop
Portal ScreenCast flow, implemented in Rust with `ashpd`.

1. Create a ScreenCast portal session.
2. Read its advertised source and cursor modes.
3. Request monitor/window selection with `cursor_mode = Metadata` only if that
   mode is advertised.
4. Start the portal and connect to the returned PipeWire stream, preferring the
   monotonic `pipewire-serial` over reusable node IDs where available.
5. Treat a denied/cancelled picker or unavailable metadata mode as an explicit
   capability/track outcome; do not fabricate cursor data.

Read `spa_meta_cursor` from PipeWire video buffers in metadata mode:

- `id` becomes `nativeCursorId: "pipewire:<id>"`;
- `position` is mapped into the selected stream's capture region;
- `hotspot` is copied into the cursor event/catalogue;
- bitmap metadata is not persisted for new sessions.

PipeWire cursor metadata has an opaque ID, not a standard semantic cursor
name. Default to `cursorKind: "custom"` unless a compositor-provided mapping
can be proven correct.

If the portal exposes only `Embedded`, either capture with the cursor embedded
and mark the separate cursor track unavailable, or reject the separate-cursor
configuration with a clear capability error. Do not draw a second synthetic
cursor on top of embedded video.

## Video recording

Use system GStreamer through `gstreamer-rs`, `gstreamer-app`, and
`gstreamer-video`. Rust owns pipeline creation, state changes, bus monitoring,
and segment finalization. Do not spawn FFmpeg or another recorder process.

Suggested backend structure:

```text
packages/capture/src/screen/linux/
  mod.rs              shared source/capability interfaces
  x11.rs              X11 discovery and capture source
  wayland_portal.rs   XDG Portal request/session handling
  pipewire.rs         PipeWire stream and cursor metadata adapter
  gstreamer.rs        pipeline factory, bus/error handling, segment sink
  cursor_x11.rs       XFixes/XInput2 cursor adapter
  cursor_wayland.rs   PipeWire metadata cursor adapter
```

Runtime encoder selection:

1. Prefer an available compatible hardware encoder.
2. Fall back to a supported software encoder.
3. Before a session starts, check all required source, conversion, muxer, and
   encoder plugins. Report a named capability error when GStreamer is missing
   or incomplete rather than failing after recording begins.

The output must use the same segment contract as other native screen backends:
each segment has a known start/end session timestamp, completion state,
metrics, and failure reason. Pausing stops media advancement without changing
the shared session clock contract. Resume starts a valid subsequent segment.

## Semantic cursor session contract

New sessions never write `cursor/shapes/*.png`. `cursor/shapes.json` is a
catalogue keyed by `cursorId`:

```json
{
  "x11:1042": {
    "cursorKind": "custom",
    "nativeCursorId": "x11:1042",
    "hotspot": { "x": 3, "y": 2 }
  }
}
```

Cursor shape events contain:

```json
{
  "event": "shape",
  "sessionNs": 1200000000,
  "cursorId": "pipewire:37",
  "cursorKind": "custom",
  "nativeCursorId": "pipewire:37",
  "hotspot": { "x": 4, "y": 3 }
}
```

The portable vocabulary currently includes `default`, `textcursor`,
`handpointing`, `busy`, `help`, `cross`, `move`, resize variants, and `custom`.
The editor/export maps known kinds to bundled SVG assets. `custom` always uses
the default SVG and must visibly state that the system cursor was not
translated. Per-`cursorId` editor overrides remain the user-controlled way to
replace a custom cursor.

Older bitmap sessions remain readable through the legacy Electron reader. They
must not be migrated or rewritten merely by opening a project.

## Dependencies and non-goals

- Add Linux dependencies behind focused `cfg(target_os = "linux")` code.
- Use `ashpd`, `pipewire`, `x11rb`, and GStreamer Rust bindings; keep each
  adapter independently testable behind a small trait.
- Do not use `xcap` as the production recording backend: its recording path is
  still work in progress and it does not remove Wayland portal constraints.
- Do not use wlroots-only screenshot libraries as a universal Wayland backend.
- Do not capture audio in this backend. Electron owns audio/camera sidecars.

## Delivery order

1. Add capability probing and explicit unavailable/error states.
2. Implement deterministic X11 monitor recording with software GStreamer
   encoding, stop/finalize, and manifest segment output.
3. Add X11 window capture and XFixes/XInput2 cursor events.
4. Add Wayland Portal source selection and PipeWire video recording.
5. Add `spa_meta_cursor` processing when portal metadata mode is available.
6. Integrate pause/resume, recovery, health/timing, and hardware encoder
   selection for both paths.
7. Add user cursor overrides and editor/export coverage if not already present.

## Required tests

Deterministic Rust tests:

- Portal mode negotiation, cancellation, denial, stale/reused PipeWire node
  IDs, and capability errors.
- X11 cursor serial changes, crop/coordinate mapping, visibility, and button
  transitions using simulated adapters.
- PipeWire cursor metadata parsing with absent bitmap, zero ID, changed hotspot,
  and opaque/custom identities.
- GStreamer plugin selection, hardware-to-software fallback, bus failures,
  segment finalization, pause/resume, and truncated cursor JSONL recovery.
- Schema serialization, legacy bitmap-session reading, and proof that a new
  session has no cursor PNG path or bitmap write.

Opt-in hardware tests, never part of deterministic CI:

- X11 monitor and window capture.
- GNOME/KDE/wlroots Wayland portal selection and cancellation.
- PipeWire metadata cursor availability.
- At least one hardware encoder and the software fallback.
- Permission revocation and compositor/portal disconnection while recording.

## Acceptance criteria

- A selected X11 or Wayland source produces valid screen-track segments and a
  completed or explicitly failed manifest state.
- No external recorder process is launched.
- New cursor sessions contain semantic events/catalogue only, with no PNG
  cursor assets.
- Unavailable portal, GStreamer, source, or cursor capability is visible to
  callers and users; no fake recording or cursor data is created.
- Existing session timing and recovery rules continue to apply unchanged.
