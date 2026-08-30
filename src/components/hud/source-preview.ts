import type { CapturePreview, CaptureSource } from '../../api/types/capture-api';

export const matchScreenPreview = (
  source: CaptureSource,
  displaySources: CaptureSource[],
  previews: CapturePreview[],
): CapturePreview | null => {
  const nativeMatch = previews.find((preview) => preview.id === source.id);
  if (nativeMatch) return nativeMatch;
  const exactMatch = previews.find(
    (preview) => source.displayId && preview.displayId && String(preview.displayId) === String(source.displayId),
  );
  if (exactMatch) return exactMatch;

  // Windows exposes a device path in the native catalog and a numeric display
  // id through Electron. A one-to-one catalog is the only safe fallback.
  return displaySources.length === 1 && previews.length === 1 ? previews[0] : null;
};

export const canonicalMacWindowSourceId = (sourceId: string | null): string | null => {
  if (!sourceId) return null;
  if (/^sck:window:\d+$/.test(sourceId)) return sourceId;
  const match = /^window:(\d+)(?::|$)/.exec(sourceId);
  return match ? `sck:window:${match[1]}` : sourceId;
};
