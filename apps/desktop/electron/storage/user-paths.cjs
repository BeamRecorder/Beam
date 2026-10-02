const path = require('path');

/** Resolves every mutable user-data location without creating it. */
function createUserPaths(videosDirectory) {
  const user = path.join(videosDirectory, 'Beam', 'user');
  return Object.freeze({
    user,
    preferences: path.join(user, 'preferences.json'),
    editorPresets: path.join(user, 'editor-presets.json'),
    screenshotPresets: path.join(user, 'screenshot-presets.json'),
    screenshots: path.join(user, 'projects', 'screenshot'),
    studioProjects: path.join(user, 'projects', 'studio'),
    instantProjects: path.join(user, 'projects', 'instant'),
    projects: path.join(user, 'projects'),
    wallpapers: path.join(user, 'media', 'wallpapers'),
    wallpaperImages: path.join(user, 'media', 'wallpapers', 'image'),
    wallpaperVideos: path.join(user, 'media', 'wallpapers', 'video'),
    fonts: path.join(user, 'media', 'fonts'),
    cursors: path.join(user, 'media', 'cursors'),
    whisperModels: path.join(user, 'models', 'whisper'),
  });
}

module.exports = { createUserPaths };
