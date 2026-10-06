# Zooms: attention and depth

Two eight-second, silent, 1280 × 800 / 60 fps loops for the private website's
`features/zooms` 2D and 3D sections. Light and dark variants share the same timing.

Use Beam's native Vue controls, timeline painter, camera spring and GPU perspective
compositor. The captured Beautiful Captures artwork is the subject. A macOS pointer
selects zoom regions and directional presets; the preview answers those choices.
Keep controls readable, the preview large and the 3D plane visibly tilted. The
Tahoe wallpapers fill the backdrop without stretching. No extra marketing copy.

Authoring uses a single paused GSAP clock. Every state and painted frame must seek
in either direction, and the final frame must match the first. Native UI timing is
illustrated; no capture sessions or desktop APIs run in the demo. Render through
Beam's standalone motion CLI. Do not launch or test the desktop application.

Deliver compressed WebM loops and matching WebP posters; the website's existing
video component supplies theme switching, pause and reduced-motion behavior.
