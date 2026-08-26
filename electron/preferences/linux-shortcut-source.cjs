const { execFile: defaultExecFile } = require('node:child_process');
const { createHash } = require('node:crypto');

const SETTINGS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const CUSTOM_SCHEMA = `${SETTINGS_SCHEMA}.custom-keybinding`;
const CUSTOM_ROOT = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/';
const BEAM_ROOT = `${CUSTOM_ROOT}beam-`;
const SHORTCUT_ARGUMENT = '--beam-shortcut=';

const MODIFIERS = new Map([
  ['ctrl', 'Control'],
  ['control', 'Control'],
  ['commandorcontrol', 'Control'],
  ['alt', 'Alt'],
  ['shift', 'Shift'],
  ['meta', 'Super'],
  ['super', 'Super'],
  ['cmd', 'Super'],
  ['command', 'Super'],
]);

const SPECIAL_KEYS = new Map([
  ['arrowup', 'Up'],
  ['arrowdown', 'Down'],
  ['arrowleft', 'Left'],
  ['arrowright', 'Right'],
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['space', 'space'],
  ['enter', 'Return'],
  ['return', 'Return'],
  ['backspace', 'BackSpace'],
  ['delete', 'Delete'],
  ['insert', 'Insert'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'Page_Up'],
  ['pagedown', 'Page_Down'],
]);

function isGnomeWayland(platform, env) {
  const desktop = `${env.XDG_CURRENT_DESKTOP || ''}:${env.XDG_SESSION_DESKTOP || ''}`.toLowerCase();
  return (
    platform === 'linux' &&
    (env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY)) &&
    /(^|:)gnome($|:)|(^|:)ubuntu($|:)/.test(desktop)
  );
}

function gnomeAccelerator(keys) {
  const tokens = String(keys)
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const modifiers = [];
  let key = null;
  for (const token of tokens) {
    const modifier = MODIFIERS.get(token);
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
      continue;
    }
    if (key) return null;
    key =
      SPECIAL_KEYS.get(token) ||
      (/^[a-z]$/.test(token)
        ? token
        : /^\d$/.test(token)
          ? token
          : /^f(?:[1-9]|1[0-2])$/.test(token)
            ? token.toUpperCase()
            : null);
  }
  if (!key) return null;
  return `${modifiers.map((modifier) => `<${modifier}>`).join('')}${key}`;
}

function customPath(id) {
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 16);
  return `${BEAM_ROOT}${digest}/`;
}

function gvariantString(value) {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function gvariantStringList(values) {
  return `[${values.map(gvariantString).join(', ')}]`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function readPaths(output) {
  return [...String(output).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function run(execFile, args) {
  return new Promise((resolve, reject) => {
    execFile('gsettings', args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

function shortcutCommand({ app, applicationRoot, id }) {
  const executable = typeof app.getPath === 'function' ? app.getPath('exe') : process.execPath;
  const command = app.isPackaged
    ? [executable]
    : ['env', 'BEAM_DEVELOPMENT_INSTANCE=1', executable, '--no-sandbox', applicationRoot];
  return `${command.map(shellQuote).join(' ')} ${shellQuote(`${SHORTCUT_ARGUMENT}${encodeURIComponent(id)}`)}`;
}

function createLinuxShortcutSource({
  app,
  applicationRoot,
  platform = process.platform,
  env = process.env,
  execFile = defaultExecFile,
} = {}) {
  if (!isGnomeWayland(platform, env)) return null;

  const readCurrentPaths = async () =>
    readPaths((await run(execFile, ['get', SETTINGS_SCHEMA, 'custom-keybindings'])).stdout);
  const setPaths = (paths) => run(execFile, ['set', SETTINGS_SCHEMA, 'custom-keybindings', gvariantStringList(paths)]);
  const cleanup = async () => {
    const paths = await readCurrentPaths();
    await setPaths(paths.filter((path) => !path.startsWith(BEAM_ROOT)));
  };
  const register = async (preferences) => {
    const entries = Object.entries(preferences.shortcuts)
      .filter(([, entry]) => entry.scope === 'global')
      .map(([id, entry]) => ({ id, path: customPath(id), binding: gnomeAccelerator(entry.keys) }));
    const gnomeEntries = entries.filter((entry) => entry.binding);
    try {
      const currentPaths = await readCurrentPaths();
      const paths = [
        ...currentPaths.filter((path) => !path.startsWith(BEAM_ROOT)),
        ...gnomeEntries.map((entry) => entry.path),
      ];
      for (const entry of gnomeEntries) {
        const schema = `${CUSTOM_SCHEMA}:${entry.path}`;
        await run(execFile, ['set', schema, 'name', gvariantString(`Beam ${entry.id}`)]);
        await run(execFile, [
          'set',
          schema,
          'command',
          gvariantString(shortcutCommand({ app, applicationRoot, id: entry.id })),
        ]);
        await run(execFile, ['set', schema, 'binding', gvariantString(entry.binding)]);
      }
      await setPaths(paths);
      return {
        gnomeIds: gnomeEntries.map((entry) => entry.id),
        fallbackIds: entries.filter((entry) => !entry.binding).map((entry) => entry.id),
      };
    } catch {
      return null;
    }
  };

  return { register, cleanup };
}

module.exports = {
  createLinuxShortcutSource,
  gnomeAccelerator,
  isGnomeWayland,
  customPath,
};
