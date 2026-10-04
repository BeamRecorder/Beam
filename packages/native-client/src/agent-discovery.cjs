const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function agentDirectory({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const config =
    platform === 'win32'
      ? env.APPDATA || path.join(home, 'AppData/Roaming')
      : platform === 'darwin'
        ? path.join(home, 'Library/Application Support')
        : env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(config, 'Beam Agents');
}

function discoverAgents(directory = agentDirectory()) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => /^\d+\.json$/.test(file))
    .flatMap((file) => {
      try {
        const target = path.join(directory, file);
        const stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) return [];
        const value = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (
          value.version !== 1 ||
          !Number.isInteger(value.pid) ||
          value.pid <= 0 ||
          file !== `${value.pid}.json` ||
          !Number.isInteger(value.port) ||
          value.port < 1 ||
          value.port > 65535 ||
          !/^[a-f0-9]{64}$/.test(value.token)
        )
          return [];
        process.kill(value.pid, 0);
        return [value];
      } catch {
        return [];
      }
    });
}

module.exports = { agentDirectory, discoverAgents };
