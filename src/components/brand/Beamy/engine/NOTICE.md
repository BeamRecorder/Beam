The morphing engine, measured radial profiles, state catalogue, shapes, expressions and regression tests are adapted from [Bloub](https://github.com/jeremy-prt/bloub), by Jérémy Perret (MIT), commit b4bb3c1b5f93c7b87a2e8d620f667c4093d97749. The complete license is in LICENSE.

Beam adds morphable sparkle/star eyes and a standalone mascot laboratory. Types have been extracted into bot-types.ts and the source formatted to follow Beam's engineering contract. The upstream design reference is x.ai; this adaptation is not affiliated with x.ai.

All body silhouettes share 64 radial samples. Interpolated radii are converted to a closed Catmull–Rom SVG path. The engine is clock-free: timestamped setters and sample(t) drive state transitions, gaze, blinking, particles and depth-sorted orbits. The UI owns playback and browser events.
