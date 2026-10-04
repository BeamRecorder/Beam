# Native captions and voiceover loops

Two eight-second website motion graphics, 1280 × 800 at 60 fps, with separate
light/dark outputs. The site uses its existing system-theme player, visibility
pausing, manual pause and reduced-motion posters.

- **Your words, beautifully readable:** local-generation controls, three timed
  caption segments, a style change, native word highlighting/pop, font-size drag,
  caption background and transcript export presentation. Fixed **Nocturne**.
- **Give the story its voice:** native voiceover controls with a progressive
  waveform, the take on an audio timeline, a volume drag and peak normalization.
  Fixed **Sunrise**.

These are explicitly authored UI illustrations, not captured recordings or a
benchmark of Whisper. No model downloads, microphone recording or filesystem
dialogs run during rendering. The native caption text/shape painter, word-timing
resolver, timeline painter, Audio panels, VoiceoverControlBar, WaveformCanvas,
UI primitives, macOS artwork/hotspots and engine spring/ripples are reused.

The inspected source waveforms derive from local PCM: an eSpeak NG sentence and
the CC0 Empacotatron loop. The website videos are intentionally silent. The voice
was generated with the installed external eSpeak NG command; no speech engine or
models are bundled. `scripts/waveform.mjs` deterministically regenerates the
waveform JSON and peak gain using external FFmpeg.

```sh
bun install
node scripts/waveform.mjs
bun run build
bun run test --coverage
bun run typecheck
bun run check
BEAM_CHROMIUM_EXECUTABLE=/path/to/chrome bun run verify

# Use an already running Beam instance. These create independent projects.
BEAM_INSTANCE=<instance-id> bun run publish captions dark
BEAM_INSTANCE=<instance-id> bun run publish captions light
BEAM_INSTANCE=<instance-id> bun run publish audio dark
BEAM_INSTANCE=<instance-id> bun run publish audio light

# Beam CLI renders without starting or replacing an editor.
# Use an available hardware GPU; omit this for Chromium's software default.
export BEAM_CHROMIUM_GPU=hardware
bun run render captions dark
bun run render captions light
bun run render audio dark
bun run render audio light
bun run website
```

The source entry is `index.html` (captions/dark); the build generates four
`dist/<mode>-<theme>/index.html` compositions with one paused GSAP root each.
Authored state is a pure function of the seek clock. Native control CSS transitions
are removed only in the compiled video derivatives; the desktop is untouched.
The final state fades out briefly before resetting under zero opacity, and fades
back to the exact initial pixels. Native waveform rendering is awaited under seek.

Rights and provenance are recorded in `assets/NOTICE.md`, the font license and
`.media/manifest.jsonl`. FFmpeg is an external preprocessing tool; no FFmpeg
executable or shared library is distributed by this example.
