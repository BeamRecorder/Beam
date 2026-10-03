import { readFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';
import { createOrderedTimelineIndex } from '../../packages/engine/src/shared/ordered-timeline-index';
import { createTimelineIntervalIndex } from '../../packages/engine/src/shared/timeline-interval-index';
import { compileSceneComposition } from '../../packages/engine/src/scene/scene-clock';
import { mayBeEnabled } from '../../packages/engine/src/scene/scene-visibility';
import type { ClipComposition, Clip } from '../../packages/engine/src/shared/composition-types';

const path = process.argv[2];
if (!path) throw new Error('Usage: bun scripts/performance/benchmark-render-preparation.ts PROJECT.json');
const project = JSON.parse(await readFile(path, 'utf8')) as { editor: { composition: ClipComposition } };
const authored = project.editor.composition;
const composition = compileSceneComposition(authored);
const order = new Map(composition.clips.map((clip, i) => [clip, i]));
const compare = (a: Clip, b: Clip) => b.order - a.order || order.get(a)! - order.get(b)!;
const intervals = composition.clips
  .filter((clip) => mayBeEnabled(authored, clip) && clip.kind !== 'audio')
  .map((value) => ({ start: value.timelineStartMs, end: value.timelineStartMs + value.timelineDurationMs, value }));
const baselineStarted = performance.now();
const original = createTimelineIntervalIndex(intervals);
const baselineBuildMs = performance.now() - baselineStarted;
const retainedStarted = performance.now();
const retained = createOrderedTimelineIndex(intervals, compare);
const retainedBuildMs = performance.now() - retainedStarted;
const ticks = Array.from({ length: 60 }, (_, frame) => 1 + (frame * 1000) / 60);
for (const time of ticks) {
  const a = original(time).sort(compare),
    b = retained(time);
  if (a.length !== b.length || a.some((clip, i) => clip !== b[i]))
    throw new Error('Ordered window changed query results.');
}
const baseline: number[] = [],
  cached: number[] = [];
const measure = (query: (time: number) => readonly Clip[]) => {
  const start = performance.now();
  for (const time of ticks) query(time);
  return performance.now() - start;
};
for (let sample = -5; sample < 40; sample++) {
  const values =
    sample % 2 === 0
      ? [measure((time) => original(time).sort(compare)), measure(retained)]
      : (() => {
          const cached = measure(retained);
          return [measure((time) => original(time).sort(compare)), cached];
        })();
  if (sample >= 0) {
    baseline.push(values[0]!);
    cached.push(values[1]!);
  }
}
const summarize = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
process.stdout.write(
  JSON.stringify(
    {
      scope: 'Temporal query and paint-order preparation only; no animation, drawing, decoding or presentation.',
      environment: { platform: platform(), cpu: cpus()[0]?.model, runtime: `Bun ${Bun.version}` },
      clipCount: composition.clips.length,
      activeAtFirstTick: retained(ticks[0]!).length,
      ticksPerSample: ticks.length,
      samples: baseline.length,
      warmups: 5,
      baselineBuildMs,
      retainedBuildMs,
      baseline: summarize(baseline),
      retained: summarize(cached),
    },
    null,
    2,
  ) + '\n',
);
