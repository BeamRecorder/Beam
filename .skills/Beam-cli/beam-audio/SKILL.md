---
name: beam-audio
description: Arrange and adjust audio in Beam video timelines using real media clips, gain commands and native animation tracks. Use for narration/music balance, fades, timing and audible export verification.
---

# Beam audio

Inspect the document and actual audio tracks before editing. Read `../beam-cli/references/authoring.md` for live transactions and `../beam-assets/SKILL.md` for import. Ask whether audio is required if a new video's brief leaves that decision open; do not add an arbitrary soundtrack to a silent UI demo.

## Use the Beam timeline

Import real audio with `assets.import` and `kind: "audio"`, then insert it with a validated native clip command. Importing alone does not add playback. Keep sound on Beam's timeline for predictable preview/export; live HTML preview media is muted.

`clip.volume` takes `{clipId, volume}`. Read existing clip/schema values and the installed command documentation to establish its range/unit; do not treat a gain value as a percentage merely because a UI uses percent labels.

Move, trim and rate commands share the video timeline contract. Preserve synchronization with the recorded action, voiceover and captions. Inspect source timing after edits; do not infer that a visual clip split also creates the desired audio fade.

## Gain and fades

For supported gain automation, use native property tracks with `animation.set`. Read existing tracks and `beam-cli docs commands` for the addressable property and clock. Use `../beam-animation/SKILL.md` for track shape and deterministic timing.

Balance narration against music by listening to a rendered section at ordinary playback volume. Fade music around speech where it helps comprehension; do not claim automatic ducking or a specific loudness target without measuring the actual result. Check peaks and avoid clipping when mixing multiple tracks.

Beam CLI does not expose a general-purpose EQ/compressor/reverb command catalog. Do not submit invented audio effect commands. If the requested treatment requires an external audio tool, explain the concrete step and use it only within the authorized task, preserving the original asset.

## Narration and captions

Use supplied narration or a service explicitly available and authorized by the user. Beam's local transcription UI is not a built-in speech-generation endpoint. Do not promise a CLI transcription/TTS command absent from `tools list`.

Keep spoken wording, on-screen text and timed captions consistent. Caption timings should follow the final audio edit, not the untrimmed recording.

## Verify the actual export

Render and listen to the beginning, transitions, loudest section and ending. Check that the expected streams are present, stereo/channel behavior is appropriate, no unintended silence remains and sound ends cleanly. A visual frame capture cannot verify audio. Follow `../beam-export/SKILL.md` for final deliverables.
