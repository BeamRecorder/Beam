import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { root } from './beam-cli.mjs';
mkdirSync(resolve(root, '.beam/checks'), { recursive: true });
for (const mode of ['2d', '3d'])
  for (const theme of ['light', 'dark']) {
    const result = spawnSync(
      'npx',
      ['--yes', 'hyperframes', 'check', resolve(root, `dist/${mode}-${theme}`), '--json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    writeFileSync(resolve(root, `.beam/checks/${mode}-${theme}.json`), result.stdout);
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    const report = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
    if (!report.ok) throw new Error(`${mode}/${theme} failed composition checks`);
    console.log(`${mode}/${theme}: layout, runtime, motion and contrast checks passed`);
  }
