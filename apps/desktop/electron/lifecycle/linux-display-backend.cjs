const { applyHyprlandWindowRules } = require('./hyprland-window-rules.cjs');

function x11LaunchArguments(args) {
  return [
    ...args.filter(
      (value, index) =>
        value !== '--ozone-platform' &&
        !value.startsWith('--ozone-platform=') &&
        args[index - 1] !== '--ozone-platform',
    ),
    '--ozone-platform=x11',
  ];
}

function configureLinuxDisplayBackend(app, platform = process.platform, argv = process.argv, env = process.env) {
  if (platform !== 'linux') return;
  // Ozone also initializes in Chromium's GPU subprocess. It must be selected
  // on the original command line, before Electron loads the main JS entry.
  if (app.commandLine.getSwitchValue('ozone-platform') !== 'x11') {
    app.relaunch({ args: x11LaunchArguments(argv.slice(1)) });
    app.exit(0);
    return;
  }
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  void applyHyprlandWindowRules(env, platform);
}

module.exports = { applyHyprlandWindowRules, configureLinuxDisplayBackend, x11LaunchArguments };
