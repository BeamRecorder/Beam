# Briefs that support implementation

Write decisions, not generic instructions or empty templates. Omit fields that do not apply.

## design.md

- **Outcome:** the message and viewer action, in one sentence each.
- **Delivery:** image/video, width × height, FPS and duration if relevant, platform and file format.
- **Audience:** what the viewer already knows and how much detail they can read.
- **Direction:** selected references and which qualities to borrow: framing, typography, pace, contrast.
- **Assets:** exact local paths for recordings, screenshots, logos, fonts and audio; note missing inputs.
- **Visual system:** palette values, font families/weights, type scale, safe margins, frame/background treatment.
- **Motion:** pace and intent, emphasis moments, entry/exit behavior, camera limits and ending.
- **Content:** approved wording and product claims. Mark unresolved wording explicitly.
- **Constraints:** preserved elements, transparency, editable native text, required captions and accessibility.

## frame.md

For each meaningful scene or a single still, record:

- Scene name, time interval in seconds and one communication goal.
- Background and main subject, including real source crop/fit behavior.
- Text hierarchy with actual wording and intended line breaks.
- Layout regions in pixels or clearly identified normalized coordinates.
- Foreground/background layering and any mask, frame or lens.
- Motion beats and what must remain readable during them.
- A representative inspection timestamp and expected visible state.

A useful frame plan might say “At 2.0 s, the 1280 × 720 capture occupies x=160, y=140, w=960, h=540; the 48 px title sits above it.” It should not merely say “make it premium.”

Keep timing units explicit. These human briefs may use seconds; Beam document clocks and `seek` use milliseconds. `motion` job `duration` uses seconds.
