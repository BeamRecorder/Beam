const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const videoClipKinds = new Set(['screen', 'video', 'webcam']);

function createProjectPreview({ safePath, sessionFileFor, mediaUrlFor, writeManifest, repairMetadata = true }) {
  return (directory, manifest, sessions) => {
    if (typeof manifest.previewSrc === 'string') {
      const source = mediaUrlFor(manifest.previewSrc);
      if (source) return source;
    }

    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session?.relativePath);
      const screenDirectory = sessionDirectory && path.join(sessionDirectory, 'screen');
      const video =
        screenDirectory &&
        fs.existsSync(screenDirectory) &&
        fs
          .readdirSync(screenDirectory)
          .filter((name) => /\.mp4$/i.test(name))
          .sort()[0];
      if (!video) continue;
      const fileUrl = pathToFileURL(path.join(screenDirectory, video)).href;
      const source = mediaUrlFor(fileUrl);
      if (!source) continue;
      if (repairMetadata) {
        manifest.previewSrc = fileUrl;
        try {
          writeManifest(directory, manifest);
        } catch {
          // A read-only project can still display its existing media.
        }
      }
      return source;
    }

    const composition = manifest.editor?.composition;
    if (!Array.isArray(composition?.assets) || !Array.isArray(composition?.clips)) return null;
    const assets = new Map(
      composition.assets.filter((asset) => asset?.kind === 'video').map((asset) => [asset.id, asset]),
    );
    const clips = composition.clips
      .filter((clip) => clip?.enabled === true && videoClipKinds.has(clip.kind))
      .sort((a, b) => a.timelineStartMs - b.timelineStartMs || a.order - b.order);
    for (const clip of clips) {
      const asset = assets.get(clip.assetId);
      if (!asset) continue;
      const file =
        asset.origin === 'session'
          ? sessionFileFor(directory, asset.sessionId, asset.sessionPath, manifest)
          : asset.origin === 'project'
            ? safePath(path.join(directory, 'media'), asset.fileName)
            : null;
      const source = file && mediaUrlFor(pathToFileURL(file).href);
      if (source) return source;
    }
    return null;
  };
}

module.exports = { createProjectPreview };
