import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, '../../apps/cli/src/index.ts');
const working = resolve(root, '.beam');
mkdirSync(working, { recursive: true });
mkdirSync(resolve(root, 'dist/renders'), { recursive: true });
const run = (args) => {
  const result = spawnSync('bun', [cli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Beam CLI failed: ${args[0]}`);
};
const document = resolve(working, 'audio-document.json');
const commands = resolve(working, 'audio-commands.json');
rmSync(document, { force: true }); // Regenerate only this script's disposable Beam document.
run(['create', 'video', document]);
writeFileSync(
  commands,
  JSON.stringify(
    [
      {
        type: 'asset.add',
        payload: {
          id: 'ai-native-zaro:audio',
          kind: 'audio',
          name: 'Zaro supplied reference soundtrack',
          fileName: null,
          src: resolve(root, 'references/audio/zaro-reference.m4a'),
          durationMs: 68600,
          width: null,
          height: null,
          origin: 'project',
        },
      },
      {
        type: 'clip.add',
        payload: {
          id: 'ai-native-zaro:score',
          assetId: 'ai-native-zaro:audio',
          trackId: 'ai-native-zaro:audio',
          kind: 'audio',
          name: 'Zaro supplied reference soundtrack',
          role: 'imported',
          volume: 100,
          enabled: true,
          order: 0,
          timelineStartMs: 0,
          timelineDurationMs: 68600,
          sourceInMs: 0,
          sourceDurationMs: 68600,
          playbackRate: 1,
          transitions: { entry: null, exit: null },
        },
      },
    ],
    null,
    2,
  ),
);
run(['edit', document, commands, document, '--overwrite']);
const job = resolve(working, 'motion.json');
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: '../index.html',
      width: 1920,
      height: 1080,
      duration: 68.6,
      fps: 30,
      format: 'mp4',
      preset: 'high',
      snapshot: JSON.parse(readFileSync(document, 'utf8')).snapshot,
    },
    null,
    2,
  ),
);
run(['motion', job, resolve(root, 'dist/renders/ai-native-zaro.mp4'), '--overwrite']);
