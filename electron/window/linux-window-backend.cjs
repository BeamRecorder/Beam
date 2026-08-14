function selectLinuxWindowBackend({ platform, sessionType, display, hasOzoneSwitch }) {
  if (platform !== 'linux' || sessionType !== 'wayland' || !display || hasOzoneSwitch) return null;
  return 'x11';
}

function hasExplicitOzonePlatform(argv = process.argv) {
  return argv.some((argument) =>
    argument === '--ozone-platform' || argument.startsWith('--ozone-platform='));
}

function configureLinuxWindowBackend(app, environment = process.env, argv = process.argv) {
  const backend = selectLinuxWindowBackend({
    platform: process.platform,
    sessionType: environment.XDG_SESSION_TYPE,
    display: environment.DISPLAY,
    // Electron may report its automatically selected Wayland backend through
    // hasSwitch(). Only a command-line argument is an explicit user override.
    hasOzoneSwitch: hasExplicitOzonePlatform(argv),
  });
  if (backend) app.commandLine.appendSwitch('ozone-platform', backend);
  return backend;
}

module.exports = {
  configureLinuxWindowBackend,
  hasExplicitOzonePlatform,
  selectLinuxWindowBackend,
};
