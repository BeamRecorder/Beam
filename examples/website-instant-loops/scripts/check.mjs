import { spawnSync } from 'node:child_process';
import { root } from './beam-cli.mjs';
const modes = ['presets', 'export', 'clipboard', 'hero'];
const requested = process.argv[2];
if (requested && !modes.includes(requested)) throw new Error('Unknown Instant composition');
for (const mode of requested ? [requested] : modes)
  for (const theme of ['dark', 'light']) {
    const checks = mode === 'hero'
      ? [['lint', `dist/${mode}-${theme}`], ['check', `.beam/native-check/${mode}-${theme}`]]
      : [['check', `dist/${mode}-${theme}`]];
    for (const args of checks) {
      const result = spawnSync('npx', ['--yes', 'hyperframes@0.8.140', ...args], { cwd: root, stdio: 'inherit' });
      if (result.status !== 0) throw new Error('HyperFrames validation failed.');
    }
  }
