import type { CaptureCatalog, LinuxCaptureDiagnostics } from './types/capture-api';

let latestCatalog: CaptureCatalog | null = null;

export const rememberCaptureCatalog = (catalog: CaptureCatalog | null): void => {
  latestCatalog = catalog;
};

export const latestCaptureCatalog = (): CaptureCatalog | null => latestCatalog;

export const unavailableLinuxRequirements = (diagnostics?: LinuxCaptureDiagnostics): string[] => {
  if (!diagnostics || diagnostics.recordingAvailable) return [];
  const requirements =
    diagnostics.backend === 'x11'
      ? [...(diagnostics.x11 ? [diagnostics.x11] : []), diagnostics.ffmpeg]
      : [diagnostics.portal, diagnostics.pipewire, diagnostics.ffmpeg];
  return requirements
    .filter((requirement) => !requirement.available)
    .map((requirement) => requirement.detail || requirement.errorCode || 'Unknown Linux capture requirement failure');
};
