# Design

Single 16:10 frame. Beam mark and “Beam CLI” at top left, a restrained
terminal below, three fixed rows with purpose labels and commands.
Native palette/surface tokens; local Hanken Grotesk and Noto Sans Mono.
Lucide terminal/check icons. No OS impersonation, camera moves or decoration.

0.3–1.1s: tools list. 1.8–2.65s: snapshot. 3.4–4.25s: transact.
Caret tracks the character frontier. Completed commands remain visible.
Final caption lands at 4.6s; hold until 6.4s. Command content fades out
while the terminal/title stay fixed; reset behind the fade.
Frame 7 and frame 0 match. Proof: 0, 1.3, 2.9, 4.5, 5.6, 7 seconds.

Registry `code-terminal-run` was installed and inspected; its deterministic
character lookup and integer-phase caret are adapted to three command rows.
No external images, footage, audio or network are needed.
