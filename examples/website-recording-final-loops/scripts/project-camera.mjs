import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

export const projectZooms = JSON.parse(readFileSync(resolve(root, 'assets/project-camera.json'), 'utf8'));
export const projectZoomMotionBlur = { enabled: false, intensity: 0 };

/** Use the same native Beam camera in saved editable projects and motion exports. */
export function projectCameraSnapshot(theme) {
  const document = resolve(root, `.beam/projects-${theme}-camera-document.json`);
  const commands = resolve(root, `.beam/projects-${theme}-camera-commands.json`);
  const cli = resolve(root, '../../apps/cli/src/index.ts');
  const run = (args) => {
    const result = spawnSync('bun', [cli, ...args], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Beam camera preparation failed.');
  };
  if (existsSync(document)) unlinkSync(document); // Only this script's reproducible export document.
  run(['create', 'video', document]);
  const snapshot = JSON.parse(readFileSync(document, 'utf8')).snapshot;
  writeFileSync(
    commands,
    JSON.stringify(
      [
        {
          type: 'render.patch',
          payload: {
            canvas: { ...snapshot.canvas, preset: 'custom', width: 1280, height: 800 },
            zooms: projectZooms,
            zoomMotionBlur: projectZoomMotionBlur,
          },
        },
      ],
      null,
      2,
    ),
  );
  run(['edit', document, commands, document, '--overwrite']);
  return JSON.parse(readFileSync(document, 'utf8')).snapshot;
}
