import { createManualZoom } from '../../../packages/engine/src/zoom/manual-zoom';

export function cameraZooms() {
  return [
    { ...createManualZoom('html-source-2d', 800, 3700), focus: { cx: 0.3, cy: 0.43 }, depth: 2 as const },
    { ...createManualZoom('html-preview-2d', 4800, 8400), focus: { cx: 0.52, cy: 0.41 }, depth: 2 as const },
  ];
}
