import { compositionDurationMs, type ClipComposition } from '@beam/engine';
import { createCompositionSceneLayerResolver } from '@beam/engine/composition/scene-layers';
import { EngineMetrics } from '@beam/runtime';
import { createDocumentSession, createCompositionCommands, validateComposition } from '@beam/engine';

export function benchmarkDocument(composition: ClipComposition, iterations = 1000) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1000000)
    throw new RangeError('Iterations must be between 1 and 1000000.');
  const metrics = new EngineMetrics({ enabled: true });
  const resolve = metrics.measure('prepare', () => createCompositionSceneLayerResolver(composition));
  const durationMs = compositionDurationMs(composition);
  const edited = composition.clips.find((clip) => !clip.locked);
  const edits = Math.min(200, iterations);
  if (edited) {
    const session = createDocumentSession(composition, {
      commands: createCompositionCommands(),
      validate: validateComposition,
    });
    for (let index = 0; index < edits; index++)
      metrics.measure('edit', () =>
        session.execute({
          type: 'clip.enable',
          payload: { clipId: edited.id, enabled: index % 2 === 0 ? !edited.enabled : edited.enabled },
        }),
      );
  }
  let visibleClips = 0;
  for (let index = 0; index < iterations; index += 1) {
    const time = durationMs === 0 ? 0 : (index / iterations) * durationMs;
    const scene = metrics.measure('seek', () => resolve(time));
    visibleClips += scene.visualStack.length + scene.captions.length;
  }
  return {
    benchmark: 'document-scene-query',
    iterations,
    clips: composition.clips.length,
    durationMs,
    visibleClips,
    editIterations: edited ? edits : 0,
    metrics: metrics.snapshot(),
  };
}
