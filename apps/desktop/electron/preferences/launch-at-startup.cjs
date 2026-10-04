const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Desktop Entry quoting has two layers: string escaping, then Exec escaping.
function desktopExec(executable) {
  if (!path.isAbsolute(executable) || /[\r\n\0=]/.test(executable)) throw new Error('Invalid startup executable path.');
  const quoted = executable.replace(/%/g, '%%').replace(/[\\"`$]/g, '\\$&');
  return `"${quoted.replace(/\\/g, '\\\\')}"`;
}

function createLaunchAtStartup({ app, platform = process.platform, env = process.env, execPath = process.execPath }) {
  let applied;
  const apply = (preferences) => {
    const enabled = preferences.launchAtStartup !== false;
    // A development Electron binary cannot launch the installed Beam application.
    if (!app.isPackaged || applied === enabled) return;
    if (platform === 'linux') {
      const configRoot =
        env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)
          ? env.XDG_CONFIG_HOME
          : path.join(app.getPath('home'), '.config');
      const directory = path.join(configRoot, 'autostart');
      const file = path.join(directory, 'com.beam.app.desktop');
      const executable = env.APPIMAGE || execPath;
      const source = enabled
        ? `[Desktop Entry]\nType=Application\nName=Beam\nExec=${desktopExec(executable)} --ozone-platform=x11\nTerminal=false\nStartupNotify=false\nX-GNOME-Autostart-enabled=true\n`
        : '[Desktop Entry]\nType=Application\nName=Beam\nHidden=true\n';
      fs.mkdirSync(directory, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, source, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, file);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    } else if (platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: enabled, enabled, path: execPath, args: [], name: 'Beam' });
    } else if (platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: enabled });
    } else {
      throw new Error(`Launch at startup is not supported on ${platform}.`);
    }
    applied = enabled;
  };
  return { apply };
}

function initializeLaunchAtStartup(app, preferences) {
  const service = createLaunchAtStartup({ app });
  try {
    service.apply(preferences);
  } catch (error) {
    console.error('[Launch at startup] OS registration failed:', error);
  }
  return service;
}

module.exports = { createLaunchAtStartup, initializeLaunchAtStartup, desktopExec };
