const path = require('path');

/** Resolves every mutable user-data location without creating it. */
function createUserPaths(videosDirectory) {
  const user = path.join(videosDirectory, 'Beam', 'user');
  return Object.freeze({
    user,
    preferences: path.join(user, 'preferences.json'),
    editorPresets: path.join(user, 'editor-presets.json'),
    projects: path.join(user, 'projects'),
    wallpapers: path.join(user, 'media', 'wallpapers'),
    wallpaperImages: path.join(user, 'media', 'wallpapers', 'image'),
    wallpaperVideos: path.join(user, 'media', 'wallpapers', 'video'),
    fonts: path.join(user, 'media', 'fonts'),
    cursors: path.join(user, 'media', 'cursors'),
    whisperModels: path.join(user, 'models', 'whisper'),
    quickSnip: path.join(user, 'quick-snip'),
    quickSnipStudio: path.join(user, 'quick-snip', 'studio'),
    quickSnipRaw: path.join(user, 'quick-snip', 'raw'),
    quickSnipWork: path.join(user, 'quick-snip', '.work'),
  });
}

module.exports = { createUserPaths };
