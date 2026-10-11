import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, '.beam/checks'), { recursive: true });
for (const theme of ['light', 'dark']) {
  const result = spawnSync('npx', ['--yes', 'hyperframes@0.8.138', 'check', resolve(root, `dist/${theme}`),
    '--at', '0,0.5,1.55,2.9,3.8,5.6,6.9,8.1,9', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(resolve(root, `.beam/checks/${theme}.json`), result.stdout);
  if (result.status !== 0) throw new Error(result.stdout || result.stderr);
  const report = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  if (!report.ok) throw new Error(`${theme}: composition checks failed`);
  console.log(`${theme}: runtime, layout, motion and contrast passed`);
}
