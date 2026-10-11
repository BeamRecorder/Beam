# Publishing and standalone motion

## Live layer

Create/open a video or image project using the tools described in `beam-cli`. Save this JSON beside the composition folder, substituting the actual project UUID and snapshot revision:

```json
{
  "projectId": "PROJECT_UUID",
  "expectedRevision": 0,
  "entry": "./composition/index.html",
  "width": 1280,
  "height": 720,
  "durationMs": 6000,
  "fps": 30,
  "framework": "html",
  "name": "Product introduction"
}
```

```sh
beam-cli tools call html.publish @publish.json
beam-cli html watch @publish.json
```

Choose one publication method for the iteration, rather than publishing manually and then starting a watcher without its existing `layerId`. A fresh watcher without `layerId` inserts a new layer.

For Screenshot, use an image project and `durationMs: 0`. For a subsequent manual update, add the returned `layerId` and the latest revision. A static video source with duration zero initially occupies five seconds; use document commands to change its timeline timing.

## Standalone motion

This `job.json` points to the same HTML folder:

```json
{
  "version": 1,
  "entry": "./composition/index.html",
  "width": 1280,
  "height": 720,
  "duration": 6,
  "fps": 30,
  "format": "mp4",
  "preset": "high"
}
```

```sh
beam-cli motion job.json output.mp4
```

`duration` is seconds here; `durationMs` in `html.publish` and `seek(timeMs)` are milliseconds. The standalone motion job may carry an existing render `snapshot`; it is not a live document mutation.

Install Beam's browser backend if rendering reports it missing. Do not launch the desktop to solve a standalone browser dependency.
