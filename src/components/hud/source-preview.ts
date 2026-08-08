import type { CapturePreview, CaptureSource } from '../../api/types/capture-api';

export const matchScreenPreview = (
  source: CaptureSource,
  displaySources: CaptureSource[],
  previews: CapturePreview[],
): CapturePreview | null => {
  const exactMatch = previews.find(
    (preview) => source.displayId && preview.displayId && String(preview.displayId) === String(source.displayId),
  );
  if (exactMatch) return exactMatch;

  // Windows exposes a device path in the native catalog and a numeric display
  // id through Electron. A one-to-one catalog is the only safe fallback.
  return displaySources.length === 1 && previews.length === 1 ? previews[0] : null;
};
