# Sources and frozen media

Retrieved on **2026-10-03**. `manifest.json` records exact local hashes, dimensions
and source URLs. Runtime playback and rendering use only the bundled files.

## Announcement

- Official announcement: [Instagram Creators — Edits Assistant](https://creators.instagram.com/blog/edits-assistant/).
- User's reference: [TechCrunch — Instagram rolls out an AI video assistant for creators](https://techcrunch.com/2026/09/30/instagram-rolls-out-an-ai-video-assistant-for-creators/), published 2026-09-30.

The official page required authentication during collection. Announcement details
were cross-checked against reporting; the film uses concise original editorial copy.
The assistant offers account-aware analysis and creative guidance. The creator keeps
creative decisions. No screenshots, conversations or performance figures were invented.

## Official Instagram visual assets

- `screenshots/edits-assistant-official.png`: full-resolution announcement image,
  [hosted by TechCrunch](https://techcrunch.com/wp-content/uploads/2026/09/instagram-edits-ai.png)
  and credited there to **Instagram**. The film's three phone screens and gallery
  photographs are CSS/SVG crops of this unchanged source.
- `logos/edits-official.png`: official Edits app artwork from the listing published
  by Instagram, Inc. on Apple's [Edits App Store page](https://apps.apple.com/us/app/edits-video-editor/id6738967378).
- `logos/instagram-official.png`: official Instagram artwork from the listing
  published by Instagram, Inc. on Apple's [Instagram App Store page](https://apps.apple.com/us/app/instagram/id389801252).
- Additional App Store UI references cover captions, keyframes, ideas and insights.
  These are kept for future iterations and are not substituted for the assistant UI.
- `edits-app-store.json` and `instagram-app-store.json` freeze the original Apple
  lookup responses, including publisher identity and asset URLs.

Logos, interface artwork and photographs remain the property of their respective
owners; they are reference material for this independent announcement, not original
Beam artwork. The film carries a small official-visuals credit.

## Typography

Hanken Grotesk, by the [Hanken Grotesk project](https://github.com/marcologous/hanken-grotesk),
uses the **SIL Open Font License 1.1**. The Latin variable WOFF2 used by Beam's private
website is bundled locally with its license in `fonts/OFL.txt`.

## Device frame

`frames/iphone-16-max.svg` is the unchanged SVG extracted from the supplied local
`global-assets/frames/iphone-16-max.html.ts` reference. Its physical border and
Dynamic Island sit above the official interface crops.

## Audio

All three source sounds use **CC0 1.0**. Source pages are frozen beside the files.

- Music: [Empacotatron](https://opengameart.org/content/empacotatron), by **Fupi**.
  `audio/cc0/empacotatron_loop.ogg`, trimmed to 15 seconds for this composition.
- Impacts: [Impact](https://opengameart.org/content/impact), by **Iwan “qubodup” Gabovitch**.
  `qubodupImpactStone.flac`, from the supplied `qubodupImpact.7z` archive, pitched
  lower and synchronized with three camera changes.
- Transitions: [Air whoosh](https://opengameart.org/content/air-whoosh), by **pyranostudios**.
  `audio/cc0/whoosh2_0.wav`, trimmed and synchronized with six transitions.
- License: [CC0 1.0 public domain dedication](https://creativecommons.org/publicdomain/zero/1.0/).
- `audio/ai-native-score.wav`: the reproducible 15-second mix, 48 kHz stereo PCM,
  normalized toward -14 LUFS, with short entry/exit fades. `scripts/score.py` mixes
  the frozen sources without downloads. Beam clip gain is **100%**, not `1`.
- `audio/cues.json`: exact beat/second positions of the effects; no narration.
