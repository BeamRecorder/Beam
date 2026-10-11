---
name: beam-design
description: Establish the visual brief for a Beam video, screenshot or HTML composition. Read existing design.md and frame.md, ask for missing visual decisions, and turn the answers into an actionable design and frame plan.
---

# Beam design

Make visual decisions from the user's intent and real source material before animating. This skill applies to new artwork or substantial redesigns; a small edit to an established composition should retain its design.

## Find the brief

Look in the working project for `design.md`, `frame.md`, `BRIEF.md` and supplied references. Recognize capitalization variants such as `DESIGN.md` and `FRAME.md`; do not create conflicting duplicate briefs.

If both design/frame files are missing, **ask the user a small set of concrete questions** before choosing the direction:

- What should the viewer understand or do, and where will the video/image appear?
- What visual direction or reference should it follow? Which brand, fonts and assets are mandatory?
- What dimensions, approximate duration and audio requirements matter?

Ask only what the request and assets do not already answer. Offer two or three meaningful visual directions if the user needs help choosing. While awaiting answers, inspect the media and technical constraints without committing to a visual direction. If the user explicitly delegates design choices, choose and document them without another approval round.

If only one brief file exists, reuse its decisions and ask only about material gaps. A missing filename alone does not require repeating an already complete brief. Never demand new approvals for work already authorized.

## Record decisions

Use [references/briefs.md](references/briefs.md) to write concise, project-specific briefs:

- `design.md`: message, audience, references, palette, type, layout system, motion character and deliverable constraints.
- `frame.md`: the actual layout and content of the key frame(s), with positions, hierarchy, framing, scene timing and asset paths.

For one static screenshot, one frame plan is enough. For a video, give each scene a purpose and a duration; do not prescribe an arbitrary number of scenes. Keep existing briefs current when an accepted design decision changes.

## Design against the real content

Use the actual product capture and readable UI. Frame the user's important action, not an invented dashboard. Select one dominant focal point per shot; leave enough room for text at the final delivery size. Prefer concise labels and purposeful composition over decoration.

Typography, color and spacing should follow the chosen references. Do not default to neon gradients, glass cards, generic particles or a different style simply because those effects are easy to generate. Effects are appropriate when they support the brief.

Preserve source aspect ratios. Keep a sharp source for UI close-ups. If an asset is missing or too low-resolution, report it and adapt with the user; do not fabricate a real product state or testimonial.

Inspect the key frame before polishing the motion. For videos, follow `../beam-animation/SKILL.md`; for screenshots, follow `../beam-screenshot/SKILL.md`; for publication, follow `../beam-composition/SKILL.md`.
