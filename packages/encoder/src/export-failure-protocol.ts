import { EXPORT_FAILURE_OPERATIONS, type ExportFailureContext } from './export-failure-types';

export function isExportFailureContext(value: unknown): value is ExportFailureContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (
    !EXPORT_FAILURE_OPERATIONS.some((operation) => operation === data.operation) ||
    typeof data.errorName !== 'string' ||
    data.errorName.length > 200 ||
    typeof data.errorMessage !== 'string' ||
    data.errorMessage.length > 2000
  )
    return false;
  if (data.frame === undefined) return true;
  if (!data.frame || typeof data.frame !== 'object' || Array.isArray(data.frame)) return false;
  const frame = data.frame as Record<string, unknown>;
  return (
    Number.isSafeInteger(frame.index) &&
    (frame.index as number) >= 0 &&
    typeof frame.timeMs === 'number' &&
    Number.isFinite(frame.timeMs) &&
    frame.timeMs >= 0 &&
    Number.isSafeInteger(frame.width) &&
    (frame.width as number) > 0 &&
    Number.isSafeInteger(frame.height) &&
    (frame.height as number) > 0 &&
    Array.isArray(frame.clipIds) &&
    frame.clipIds.length <= 100 &&
    frame.clipIds.every((id) => typeof id === 'string' && id.length <= 512)
  );
}
