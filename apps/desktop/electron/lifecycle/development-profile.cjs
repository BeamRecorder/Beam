const path = require('path');
const fs = require('node:fs');
const { developmentSessionId } = require('./development-session.cjs');

function configureDevelopmentProfile(app, env = process.env, { applicationRoot, mkdirSync = fs.mkdirSync } = {}) {
  if (app.isPackaged || env.BEAM_DEVELOPMENT_INSTANCE !== '1') return false;
  const id = developmentSessionId(applicationRoot ?? app.getAppPath(), env.BEAM_DEV_SESSION);
  const directory = path.join(app.getPath('appData'), 'Beam Development', id);
  mkdirSync(directory, { recursive: true });
  // Chromium derives the Linux StatusNotifier identity from the app name.
  // Keep it D-Bus-safe; spaces can prevent the dev tray from registering.
  app.setName(`beam-development-${id}`);
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  return true;
}

module.exports = { configureDevelopmentProfile };
