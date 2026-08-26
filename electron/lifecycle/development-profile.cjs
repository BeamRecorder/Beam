const path = require('path');

function configureDevelopmentProfile(app, env = process.env) {
  if (env.BEAM_DEVELOPMENT_INSTANCE !== '1') return false;
  // Chromium derives the Linux StatusNotifier identity from the app name.
  // Keep it D-Bus-safe; spaces can prevent the dev tray from registering.
  app.setName('beam-development');
  app.setPath('userData', path.join(app.getPath('appData'), 'Beam Development'));
  return true;
}

module.exports = { configureDevelopmentProfile };
