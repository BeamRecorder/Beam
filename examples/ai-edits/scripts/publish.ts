import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImportedAsset, ProjectState, PublishedHtml, Snapshot } from './publish-types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const stateFile = resolve(root, '.beam/project.json');
const audioHash = createHash('sha256')
  .update(readFileSync(resolve(root, 'references/audio/ai-native-score.wav')))
  .digest('hex');
const instance = process.env.BEAM_INSTANCE;
const launcher = existsSync(resolve(repository, 'apps/cli/src/index.ts'))
  ? ['bun', resolve(repository, 'apps/cli/src/index.ts')]
  : ['beam-cli'];

function call<T>(tool: string, input: unknown = {}): T {
  const result = spawnSync(
    launcher[0]!,
    [...launcher.slice(1), 'tools', 'call', tool, JSON.stringify(input), ...(instance ? ['--instance', instance] : [])],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Beam CLI failed: ${tool}`);
  return JSON.parse(result.stdout) as T;
}

mkdirSync(resolve(root, '.beam'), { recursive: true });
const state: ProjectState = existsSync(stateFile)
  ? (JSON.parse(readFileSync(stateFile, 'utf8')) as ProjectState)
  : { projectId: call<{ id: string }>('projects.create', { kind: 'video', name: 'Ai-Native' }).id };
writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
const current = call<{ open: Array<{ projectId: string }> }>('projects.list');
if (!current.open.some((project) => project.projectId === state.projectId)) {
  const opening = call<{ status: string }>('projects.open', { projectId: state.projectId, kind: 'video' });
  if (opening.status === 'cancelled')
    throw new Error('Ai-Native editor opening was canceled. Run publish again when ready.');
}
let snapshot: Snapshot | undefined;
for (let attempt = 0; attempt < 30; attempt++) {
  const list = call<{ open: Array<{ projectId: string }> }>('projects.list');
  if (list.open.some((project) => project.projectId === state.projectId)) {
    snapshot = call<Snapshot>('documents.snapshot', { projectId: state.projectId });
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (!snapshot) throw new Error('The Ai-Native editor is not ready. Open this project in Beam, then run publish again.');

const published = call<PublishedHtml>('html.publish', {
  projectId: state.projectId,
  expectedRevision: snapshot.revision,
  entry: './index.html',
  width: 1920,
  height: 1080,
  durationMs: 15000,
  fps: 30,
  framework: 'html',
  name: 'Ai-Native — Edits Assistant',
  ...(state.layerId ? { layerId: state.layerId } : {}),
});
state.layerId = published.layerId;
writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
snapshot = call<Snapshot>('documents.snapshot', { projectId: state.projectId });
const commands: Array<{ type: string; payload: unknown }> = [
  {
    type: 'render.patch',
    payload: {
      canvas: {
        ...snapshot.document.canvas,
        preset: 'custom',
        width: 1920,
        height: 1080,
        showBackground: false,
        watermark: { ...(snapshot.document.canvas.watermark as Record<string, unknown>), enabled: false },
      },
      blurPercent: 0,
      zooms: [],
    },
  },
];
const existingAudio = snapshot.document.composition.clips.find((clip) => clip.id === state.audioClipId);
if (!existingAudio || state.audioHash !== audioHash) {
  const imported = call<ImportedAsset>('assets.import', {
    projectId: state.projectId,
    kind: 'audio',
    source: './references/audio/ai-native-score.wav',
  });
  commands.push({ type: 'asset.add', payload: { ...imported, durationMs: 15000, name: 'CC0 music + impacts' } });
  state.audioClipId = existingAudio?.id ?? randomUUID();
  commands.push(
    existingAudio
      ? {
          type: 'clip.patch',
          payload: { clipId: state.audioClipId, patch: { assetId: imported.id, name: 'CC0 music + impacts' } },
        }
      : {
          type: 'clip.add',
          payload: {
            id: state.audioClipId,
            assetId: imported.id,
            trackId: 'ai-native:soundtrack',
            kind: 'audio',
            name: 'CC0 music + impacts',
            role: 'imported',
            volume: 100,
            enabled: true,
            order: 0,
            timelineStartMs: 0,
            timelineDurationMs: 15000,
            sourceInMs: 0,
            sourceDurationMs: 15000,
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
console.log(JSON.stringify({ project: 'Ai-Native', ...state }, null, 2));
if (process.argv.includes('--export')) {
  mkdirSync(resolve(root, 'dist/renders'), { recursive: true });
  console.log(
    JSON.stringify(
      call('render.export', {
        projectId: state.projectId,
        output: './dist/renders/Ai-Native.mp4',
        format: 'mp4',
        preset: 'high',
        overwrite: true,
      }),
      null,
      2,
    ),
  );
}
