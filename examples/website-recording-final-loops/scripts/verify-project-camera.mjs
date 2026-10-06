import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { call, root } from './beam-cli.mjs';

const output = resolve(root, '.beam/verification');
mkdirSync(output, { recursive: true });
for (const theme of ['dark', 'light']) {
  const { projectId } = JSON.parse(readFileSync(resolve(root, `.beam/projects-${theme}-project.json`), 'utf8'));
  const snapshot = call('documents.snapshot', { projectId }).document;
  if (snapshot.zooms.length !== 1 || snapshot.zooms[0].depth !== 3 || snapshot.zooms[0].projection !== '2d')
    throw new Error('Publish the Projects camera before capturing its native proof frames.');
  for (const timeMs of [2300, 3150, 5100]) {
    const image = resolve(output, `project-camera-${theme}-${timeMs}.png`);
    // Inspect decoded delivery frames, including the native camera and asynchronous Vue controls.
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        String(timeMs / 1000),
        '-i',
        resolve(root, `renders/recording-projects-${theme}.mp4`),
        '-frames:v',
        '1',
        image,
      ],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(result.stderr || 'Render Projects before verifying its camera.');
    console.log(`${theme}/${timeMs}: decoded Beam export → ${image}`);
  }
}
