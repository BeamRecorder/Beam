const net = require('node:net');
const path = require('node:path');

const APP_CLASS = '^com\\.beam\\.app$';
const OVERLAY_TITLE = '^Beam (Recorder|Countdown|Quick Snip|Region Selection|Recording Region|Teleprompter)$';
const MATCH_RULE = `/keyword windowrule border_size 0, no_shadow on, match:class ${APP_CLASS}, match:title ${OVERLAY_TITLE}`;

function hyprlandRequest(socketPath, command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let response = '';
    const deadline = setTimeout(() => client.destroy(new Error('Hyprland IPC timed out')), timeoutMs);
    deadline.unref();
    client.once('connect', () => client.write(command));
    client.on('data', (chunk) => {
      response += chunk.toString();
      if (response.length > 16384) client.destroy(new Error('Hyprland IPC response exceeded its limit'));
    });
    client.once('end', () => resolve(response.trim()));
    client.once('error', reject);
    client.once('close', () => {
      clearTimeout(deadline);
      reject(new Error('Hyprland IPC closed without a response'));
    });
  });
}

function overlayCommands(tag) {
  const version = /^v?(\d+)\.(\d+)(?:\.|$)/.exec(tag);
  if (!version) return [];
  const major = Number(version[1]);
  const minor = Number(version[2]);
  if (major > 0 || minor >= 55) {
    return [
      `/eval _G.beam_overlay_rule = hl.window_rule({ name = "beam-overlays", match = { class = [[${APP_CLASS}]], title = [[${OVERLAY_TITLE}]] }, border_size = 0, no_shadow = true })`,
    ];
  }
  if (minor >= 53) {
    return [MATCH_RULE];
  }
  return ['noborder', 'noshadow'].map(
    (rule) => `/keyword windowrulev2 ${rule}, class:${APP_CLASS}, title:${OVERLAY_TITLE}`,
  );
}

async function applyHyprlandWindowRules(env = process.env, platform = process.platform, timeoutMs = 500) {
  if (platform !== 'linux' || !env.XDG_RUNTIME_DIR || !path.isAbsolute(env.XDG_RUNTIME_DIR)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(env.HYPRLAND_INSTANCE_SIGNATURE || '')) return false;
  const socketPath = path.join(env.XDG_RUNTIME_DIR, 'hypr', env.HYPRLAND_INSTANCE_SIGNATURE, '.socket.sock');
  try {
    const version = JSON.parse(await hyprlandRequest(socketPath, 'j/version', timeoutMs));
    const commands = overlayCommands(version.tag);
    if (!commands.length) return false;
    for (const command of commands) {
      const response = await hyprlandRequest(socketPath, command, timeoutMs);
      if (command.startsWith('/eval ') && response === 'eval is only supported with the lua config manager') {
        if ((await hyprlandRequest(socketPath, MATCH_RULE, timeoutMs)) !== 'ok') return false;
      } else if (response !== 'ok') return false;
    }
    return true;
  } catch {
    // Compositor decoration is optional; unavailable IPC must not block startup.
    return false;
  }
}

module.exports = { applyHyprlandWindowRules };
