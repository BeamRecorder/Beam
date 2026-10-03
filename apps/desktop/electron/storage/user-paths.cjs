const path = require('path');

/** User content stays in Videos even when the Chromium profile is isolated. */
function createUserPaths(app) {
  const user = path.join(app.getPath('videos'), 'Beam', 'user');
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
