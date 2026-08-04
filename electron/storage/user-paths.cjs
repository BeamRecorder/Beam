const path = require('path');

/** Resolves every mutable user-data location without creating it. */
function createUserPaths(videosDirectory) {
  const user = path.join(videosDirectory, 'Beam', 'user');
  return Object.freeze({
    user,
    preferences: path.join(user, 'preferences.json'),
    projects: path.join(user, 'projects'),
    wallpapers: path.join(user, 'media', 'wallpapers'),
    wallpaperImages: path.join(user, 'media', 'wallpapers', 'image'),
    wallpaperVideos: path.join(user, 'media', 'wallpapers', 'video'),
    whisperModels: path.join(user, 'models', 'whisper'),
  });
}

module.exports = { createUserPaths };
