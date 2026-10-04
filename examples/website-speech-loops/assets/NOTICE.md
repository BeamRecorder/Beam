# Assets and dependencies

The authored source follows Beam's MPL-2.0 license. Existing third-party artwork
retains its applicable rights; this example does not assign it a new license.

- `HankenGrotesk.ttf`: SIL Open Font License; license alongside the file.
- `macos-arrow.svg`, `macos-hand.svg`: unchanged Beam assets from
  `public/macOsSvgCursors/`, with original geometry and hotspots. See also
  `docs/agents/templates/assets/NOTICE.md`.
- `tahoe-light.webp`: Beam's existing wallpaper-library artwork; original rights
  remain. No outside download or AI-generated substitute is used.
- `beautiful-captures.webp`: Beam's existing authored Beautiful Captures example.
- `voice.wav`: locally generated with external eSpeak NG, text authored for this
  demo: “Give your story a voice. Record, arrange, and make every word clear.”
  It is an illustrative source waveform, not a personal microphone recording.
  No eSpeak executable, voice database or source code is shipped.
- `system-audio.ogg`: Empacotatron by Fupi, CC0 1.0; reused from the existing
  `examples/ai-edits/references/audio/cc0/empacotatron_loop.ogg`.
  Source: https://opengameart.org/content/empacotatron .
- `waveform.json`: peak envelopes decoded from those local audio files, with
  source hashes, actual duration and calculated gain to a -1 dBFS peak target.
- Interface icons use Lucide; controls and painters import the actual Beam source.
- Vue, GSAP and Lucide retain their own licenses.

The two output videos are silent illustrative interactions, not screen recordings
or proof of actual local transcription/recording speed. External FFmpeg creates
derivatives; no FFmpeg binary or library is bundled.
