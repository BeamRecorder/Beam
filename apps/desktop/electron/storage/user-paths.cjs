const path = require('path');

/** Preferences and shared libraries stay stable; only the project tree follows its chosen root. */
function createUserPaths(app, { projectRoot, recordingRoot = projectRoot } = {}) {
  const user = path.join(app.getPath('videos'), 'Beam', 'user');
  const projects = () => path.join(projectRoot ? projectRoot() : user, 'projects');
  const recordingProjects = () => path.join(recordingRoot ? recordingRoot() : user, 'projects');
  return Object.freeze({
    user,
    preferences: path.join(user, 'preferences.json'),
    editorPresets: path.join(user, 'editor-presets.json'),
    screenshotPresets: path.join(user, 'screenshot-presets.json'),
    get screenshots() {
      return path.join(projects(), 'screenshot');
    },
    get studioProjects() {
      return path.join(recordingProjects(), 'studio');
    },
    get instantProjects() {
      return path.join(recordingProjects(), 'instant');
    },
    get projects() {
      return projects();
    },
    wallpapers: path.join(user, 'media', 'wallpapers'),
    wallpaperImages: path.join(user, 'media', 'wallpapers', 'image'),
    wallpaperVideos: path.join(user, 'media', 'wallpapers', 'video'),
    fonts: path.join(user, 'media', 'fonts'),
    cursors: path.join(user, 'media', 'cursors'),
    whisperModels: path.join(user, 'models', 'whisper'),
  });
}

module.exports = { createUserPaths };
