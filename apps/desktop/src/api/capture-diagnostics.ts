import type { CaptureCatalog, LinuxCaptureDiagnostics } from './types/capture-api';

let latestCatalog: CaptureCatalog | null = null;

export const rememberCaptureCatalog = (catalog: CaptureCatalog | null): void => {
  latestCatalog = catalog;
};

export const latestCaptureCatalog = (): CaptureCatalog | null => latestCatalog;

export const unavailableLinuxRequirements = (diagnostics?: LinuxCaptureDiagnostics): string[] => {
  if (!diagnostics || diagnostics.recordingAvailable) return [];
  return [diagnostics.portal, diagnostics.pipewire, diagnostics.ffmpeg]
    .filter((requirement) => !requirement.available)
    .map((requirement) => requirement.detail || requirement.errorCode || 'Unknown Linux capture requirement failure');
};
