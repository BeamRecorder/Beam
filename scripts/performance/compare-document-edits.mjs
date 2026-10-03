// Run with Bun: preserves the original command's clone behavior, using today's shared validators.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  createDocumentSession,
  createCompositionCommands,
  createSnapshotHistory,
  validateComposition,
} from '@beam/engine';
import { DEFAULT_COLOR_LAYER_STYLE } from '@beam/engine/shared/color-layer-style';

const root = fileURLToPath(new URL('../../', import.meta.url));
const revision = '4143b8078c8f704f6a009483a94e0741b2ab1ad8';
const original = execFileSync(
  'git',
  ['show', `${revision}:src/components/video-editor/composition/engine/clip-engine.ts`],
  { cwd: root, encoding: 'utf8' },
);
const baselineSource = original
  .replaceAll('~/media/shared/', '@beam/engine/shared/')
  .replace(/from '\.\//g, "from '@beam/engine/commands/");
const temporaryRoot = resolve(root, 'node_modules/.tmp');
await mkdir(temporaryRoot, { recursive: true });
const directory = await mkdtemp(resolve(temporaryRoot, 'document-baseline-'));
const percentile = (samples, q) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * q) - 1];
try {
  const module = resolve(directory, 'baseline.ts');
  await writeFile(module, baselineSource);
  const { setClipEnabled } = await import(pathToFileURL(module).href);
  const results = [];
  for (const count of [1000, 10000]) {
    const input = {
      schemaVersion: 14,
      assets: [],
      keyboardCaptionSessions: [],
      clips: Array.from({ length: count }, (_, i) => ({
        ...DEFAULT_COLOR_LAYER_STYLE,
        id: `clip-${i}`,
        kind: 'color',
        name: 'Color',
        assetId: '',
        trackId: `clip-${i}`,
        timelineStartMs: 0,
        timelineDurationMs: 1000,
        sourceInMs: 0,
        sourceDurationMs: 1000,
        playbackRate: 1,
        order: i,
        enabled: true,
        transitions: { entry: null, exit: null },
        fill: { kind: 'color', color: '#ff0000' },
        transform: { x: 0, y: 0, width: 1, height: 1 },
      })),
    };
    const history = createSnapshotHistory({ onRestoreSnapshot: () => {} });
    let previous = JSON.parse(JSON.stringify(input));
    history.initialize(previous);
    const session = createDocumentSession(input, {
      commands: createCompositionCommands(),
      validate: validateComposition,
    });
    const run = (apply) => {
      const timings = [],
        states = [];
      for (let i = 0; i < 60; i++) {
        const start = performance.now(),
          value = apply(i % 2 !== 0),
          elapsed = performance.now() - start;
        if (i >= 10) {
          timings.push(elapsed);
          states.push(value);
        }
      }
      return {
        medianMs: percentile(timings, 0.5),
        p95Ms: percentile(timings, 0.95),
        retainedClipObjects: new Set(states.flatMap((state) => state.clips)).size,
      };
    };
    const before = run((enabled) => {
      previous = setClipEnabled(previous, 'clip-0', enabled);
      validateComposition(previous);
      history.record(previous);
      return previous;
    });
    const after = run((enabled) => {
      session.execute({ type: 'clip.enable', payload: { clipId: 'clip-0', enabled } });
      return session.document;
    });
    results.push({ clips: count, operations: 50, before, after, medianSpeedup: before.medianMs / after.medianMs });
  }
  process.stdout.write(
    JSON.stringify(
      {
        runtime: Bun.version,
        platform: process.platform,
        baselineRevision: revision,
        date: new Date().toISOString(),
        warmup: 10,
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
