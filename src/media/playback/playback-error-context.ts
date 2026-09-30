import type { MediaErrorContext } from '../shared/media-types';

const OPERATIONS: readonly MediaErrorContext['operation'][] = [
  'open-media',
  'inspect-track',
  'configure-decoder',
  'reset-decoder',
  'seek-frame',
  'decode-frame',
];

export function isMediaErrorContext(value: unknown): value is MediaErrorContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as Record<string, unknown>;
  return (
    OPERATIONS.includes(context.operation as MediaErrorContext['operation']) &&
    ['errorName', 'causeMessage', 'clipId'].every(
      (key) => context[key] === undefined || typeof context[key] === 'string',
    ) &&
    ['timelineSeconds', 'codedWidth', 'codedHeight'].every(
      (key) =>
        context[key] === undefined ||
        (typeof context[key] === 'number' && Number.isFinite(context[key]) && context[key] >= 0),
    ) &&
    (context.sourceSeconds === undefined ||
      (typeof context.sourceSeconds === 'number' && Number.isFinite(context.sourceSeconds))) &&
    (context.codec === undefined || context.codec === null || typeof context.codec === 'string') &&
    (context.hardwareAcceleration === undefined ||
      (typeof context.hardwareAcceleration === 'string' &&
        ['no-preference', 'prefer-hardware', 'prefer-software'].includes(context.hardwareAcceleration))) &&
    (context.optimizeForLatency === undefined || typeof context.optimizeForLatency === 'boolean')
  );
}
