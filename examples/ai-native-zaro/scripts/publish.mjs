import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageComposition } from './stage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const stateFile = resolve(root, '.beam/project.json');
const audioHash = createHash('sha256')
  .update(readFileSync(resolve(root, 'references/audio/zaro-reference.m4a')))
  .digest('hex');
const instance = process.env.BEAM_INSTANCE;
const launcher = existsSync(resolve(repository, 'apps/cli/src/index.ts'))
  ? ['bun', resolve(repository, 'apps/cli/src/index.ts')]
  : ['beam-cli'];

function call(tool, input = {}) {
  const result = spawnSync(
    launcher[0],
    [...launcher.slice(1), 'tools', 'call', tool, JSON.stringify(input), ...(instance ? ['--instance', instance] : [])],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Beam CLI failed: ${tool}`);
  return JSON.parse(result.stdout);
}

mkdirSync(resolve(root, '.beam'), { recursive: true });
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, 'utf8'))
  : { projectId: call('projects.create', { kind: 'video', name: 'ai-native-zaro' }).id };
writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
const current = call('projects.list');
if (!current.open.some((project) => project.projectId === state.projectId)) {
  const opening = call('projects.open', { projectId: state.projectId, kind: 'video', disposition: 'new-window' });
  if (opening.status === 'cancelled')
    throw new Error('ai-native-zaro editor opening was canceled. Run publish again when ready.');
}
let snapshot;
for (let attempt = 0; attempt < 30; attempt++) {
  const list = call('projects.list');
  if (list.open.some((project) => project.projectId === state.projectId)) {
    snapshot = call('documents.snapshot', { projectId: state.projectId });
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (!snapshot)
  throw new Error('The ai-native-zaro editor is not ready. Open this project in Beam, then run publish again.');

await stageComposition(root);
const published = call('html.publish', {
  projectId: state.projectId,
  expectedRevision: snapshot.revision,
  entry: './.beam/publish/index.html',
  width: 1920,
  height: 1080,
  durationMs: 68600,
  fps: 30,
  framework: 'html',
  name: 'ai-native-zaro — HTML / GSAP',
  ...(state.layerId ? { layerId: state.layerId } : {}),
});
state.layerId = published.layerId;
writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
snapshot = call('documents.snapshot', { projectId: state.projectId });
const commands = [
  {
    type: 'render.patch',
    payload: {
      canvas: {
        ...snapshot.document.canvas,
        preset: 'custom',
        width: 1920,
        height: 1080,
        showBackground: false,
        watermark: { ...snapshot.document.canvas.watermark, enabled: false },
        transitions: { entry: null, exit: null },
      },
      blurPercent: 0,
      zooms: [],
    },
  },
];
commands.push({
  type: 'clip.patch',
  payload: {
    clipId: state.layerId,
    patch: {
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: {
        ...snapshot.document.composition.clips.find((clip) => clip.id === state.layerId).appearance,
        frame: 'none',
        cornerRadius: 0,
        shadowSize: 'none',
        borderEnabled: false,
      },
      transitions: { entry: null, exit: null },
      timelineDurationMs: 68600,
      sourceDurationMs: 68600,
    },
  },
});
const existingAudio = snapshot.document.composition.clips.find((clip) => clip.id === state.audioClipId);
if (!existingAudio || state.audioHash !== audioHash) {
  const imported = call('assets.import', {
    projectId: state.projectId,
    kind: 'audio',
    source: './references/audio/zaro-reference.m4a',
  });
  commands.push({
    type: 'asset.add',
    payload: { ...imported, durationMs: 68600, name: 'Zaro supplied reference soundtrack' },
  });
  state.audioClipId = existingAudio?.id ?? randomUUID();
  commands.push(
    existingAudio
      ? {
          type: 'clip.patch',
          payload: {
            clipId: state.audioClipId,
            patch: { assetId: imported.id, name: 'Zaro supplied reference soundtrack' },
          },
        }
      : {
          type: 'clip.add',
          payload: {
            id: state.audioClipId,
            assetId: imported.id,
            trackId: 'ai-native:soundtrack',
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
  );
}
commands.push({ type: 'clip.volume', payload: { clipId: state.audioClipId, volume: 100 } });
call('documents.transact', {
  projectId: state.projectId,
  expectedRevision: snapshot.revision,
  operationId: randomUUID(),
  commands,
});
state.audioHash = audioHash;
writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
console.log(JSON.stringify({ project: 'ai-native-zaro', ...state }, null, 2));
if (process.argv.includes('--export')) {
  mkdirSync(resolve(root, 'dist/renders'), { recursive: true });
  console.log(
    JSON.stringify(
      call('render.export', {
        projectId: state.projectId,
        output: './dist/renders/ai-native-zaro.mp4',
        format: 'mp4',
        preset: 'high',
        overwrite: true,
      }),
      null,
      2,
    ),
  );
}
