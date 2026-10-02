import { resolve } from 'node:path';
import { jsonObject } from '@beam/engine/document/json-value';
import { createAuthoringSession, createRenderDocument, createDefaultClipAppearance } from '@beam/engine';
import type { MotionJob, PreparedMotion } from './motion-types';

export function prepareMotionJob(value: unknown, directory: string): PreparedMotion {
  const input = jsonObject(value) as unknown as MotionJob;
  if (
    input.version !== 1 ||
    typeof input.entry !== 'string' ||
    !input.entry.endsWith('.html') ||
    ![input.width, input.height].every(
      (dimension) => Number.isSafeInteger(dimension) && dimension >= 2 && dimension <= 16384,
    ) ||
    !Number.isFinite(input.duration) ||
    input.duration < 0.04 ||
    input.duration > 86400 ||
    !Number.isFinite(input.fps) ||
    input.fps <= 0 ||
    input.fps > 240 ||
    !['mp4', 'webm'].includes(input.format) ||
    !['low', 'medium', 'high'].includes(input.preset)
  )
    throw new TypeError('Invalid motion job.');
  const entry = resolve(directory, input.entry),
    assetId = 'motion:html',
    durationMs = Math.round(input.duration * 1000);
  const session = createAuthoringSession(
    input.snapshot ?? createRenderDocument(undefined, input.width, input.height, input.fps),
  );
  session.transaction([
    {
      type: 'asset.add',
      payload: {
        id: assetId,
        kind: 'image',
        name: 'HTML composition',
        fileName: null,
        src: entry,
        durationMs: 0,
        width: input.width,
        height: input.height,
        origin: 'project',
      },
    },
    {
      type: 'clip.add',
      payload: {
        id: 'motion:clip',
        trackId: 'motion:track',
        assetId,
        kind: 'image',
        name: 'HTML composition',
        timelineStartMs: 0,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        enabled: true,
        order: -1,
        transitions: { entry: null, exit: null },
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('image'),
        isMirrored: false,
        cameraFramingPreset: 'fit',
      },
    },
  ]);
  return {
    request: {
      projectName: 'HTML composition',
      format: input.format,
      preset: input.preset,
      snapshot: session.document,
    },
    host: { entry, assetId, width: input.width, height: input.height },
  };
}
