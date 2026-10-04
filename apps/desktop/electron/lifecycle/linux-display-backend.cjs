const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

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

function applyHyprlandWindowRules(env = process.env) {
  if (process.platform !== 'linux' || !env.HYPRLAND_INSTANCE_SIGNATURE) return;
  const runtimeDir = env.XDG_RUNTIME_DIR;
  const sig = env.HYPRLAND_INSTANCE_SIGNATURE;
  if (!runtimeDir || !sig) return;

  const socketPath = path.join(runtimeDir, 'hypr', sig, '.socket.sock');
  try {
    if (!fs.existsSync(socketPath)) return;
    const client = net.createConnection(socketPath, () => {
      // Modern Hyprland (0.55+ / Lua config): Storing in _G prevents Lua GC cleanup.
      const luaCmd =
        'eval _G.beam_overlay_rule = hl.window_rule({ match = { class = [[^com\\.beam\\.app$]], title = [[negative:.*Beam Editor.*]] }, border_size = 0, no_shadow = true })';
      client.write(luaCmd);
    });
    client.on('data', (data) => {
      const response = data.toString();
      // If modern eval was not supported (legacy hyprlang), try keyword commands
      if (response.includes('syntax error') || response.includes('unknown command')) {
        const fallbackClient = net.createConnection(socketPath, () => {
          fallbackClient.write(
            '/keyword windowrulev2 noborder, class:^(com.beam.app)$, title:negative:(.*Beam Editor.*)\n',
          );
          fallbackClient.write(
            '/keyword windowrulev2 noshadow, class:^(com.beam.app)$, title:negative:(.*Beam Editor.*)\n',
          );
          fallbackClient.end();
        });
        fallbackClient.on('error', () => {});
      }
      client.end();
    });
    client.on('error', () => {});
  } catch {
    // Ignore any socket connection issues
  }
}

function configureLinuxDisplayBackend(app, platform = process.platform, argv = process.argv, env = process.env) {
  if (platform !== 'linux') return;
  applyHyprlandWindowRules(env);
  // Ozone also initializes in Chromium's GPU subprocess. It must be selected
  // on the original command line, before Electron loads the main JS entry.
  if (app.commandLine.getSwitchValue('ozone-platform') !== 'x11') {
    app.relaunch({ args: x11LaunchArguments(argv.slice(1)) });
    app.exit(0);
    return;
  }
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

module.exports = { applyHyprlandWindowRules, configureLinuxDisplayBackend, x11LaunchArguments };
