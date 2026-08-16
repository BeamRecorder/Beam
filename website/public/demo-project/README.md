# Beam homepage demo project

The website never reads a local Beam library. It loads this public, sanitized bundle at runtime:

```text
demo-project/
├── project.json
└── session/
    ├── manifest.json
    ├── screen/
    │   └── BeamVideo.mp4
    └── cursor/
        ├── cursor.json
        ├── telemetry.json
        └── shapes.json
```

Requirements:

- `project.json` must contain a Beam `editor.composition` with `schemaVersion: 3`. Text captions and their styles live
  in this composition. Zooms live in `editor.zoom.elements`.
- `manifest.json` must be a finalized Beam session manifest. Its `sessionId` and `durationNs` are used to rebuild the
  browser media assets.
- `BeamVideo.mp4` is the single public screen recording. Webcam media is not required.
- `cursor.json`, `telemetry.json`, and `shapes.json` must come from the same recording session.
- Remove local paths, private captions, window titles, source identifiers, and any other personal data before
  committing the bundle. Every file in this directory is deployed publicly.

If a required file is absent or invalid, the homepage deliberately shows its expected repository path instead of
mounting a partial player or a fabricated timeline.
