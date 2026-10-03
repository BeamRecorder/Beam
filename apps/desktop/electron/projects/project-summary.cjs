const path = require('node:path');

function createProjectSummary({ root, category, detectProjectFeatures, previewFor, thumbnailFor }) {
  return (directory, manifest, fallbackId) => {
    const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : [];
    const id = typeof manifest.projectId === 'string' ? manifest.projectId : fallbackId;
    const { hasScreen, hasCamera, hasCaption, hasSystemAudio, hasMicrophone } = detectProjectFeatures(
      directory,
      manifest,
      sessions,
    );
    return {
      id,
      name:
        typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : `Project ${id.slice(0, 8)}`,
      createdAt: typeof manifest.createdAtUtc === 'string' ? manifest.createdAtUtc : '',
      updatedAt: typeof manifest.updatedAtUtc === 'string' ? manifest.updatedAtUtc : '',
      mode: category && path.dirname(directory) === path.join(root, 'instant') ? 'instant' : 'studio',
      sessionCount: sessions.length,
      previewSrc: previewFor(directory, manifest, sessions),
      thumbnailSrc: thumbnailFor(directory),
      hasScreen,
      hasCamera,
      hasCaption,
      hasSystemAudio,
      hasMicrophone,
    };
  };
}

module.exports = { createProjectSummary };
