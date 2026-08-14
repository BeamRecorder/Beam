function selectLinuxWindowBackend({ platform, sessionType, display, hasOzoneSwitch }) {
  if (platform !== 'linux' || sessionType !== 'wayland' || !display || hasOzoneSwitch) return null;
  return 'x11';
}

function configureLinuxWindowBackend(app, environment = process.env) {
  const backend = selectLinuxWindowBackend({
    platform: process.platform,
    sessionType: environment.XDG_SESSION_TYPE,
    display: environment.DISPLAY,
    hasOzoneSwitch: app.commandLine.hasSwitch('ozone-platform'),
  });
  if (backend) app.commandLine.appendSwitch('ozone-platform', backend);
  return backend;
}

module.exports = { configureLinuxWindowBackend, selectLinuxWindowBackend };
