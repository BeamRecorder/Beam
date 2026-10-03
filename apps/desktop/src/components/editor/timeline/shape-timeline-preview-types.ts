import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';

export interface ShapeTimelinePreviewProps {
  clip: ShapeClip;
  canvas?: Pick<OutputCanvasSettings, 'width' | 'height'>;
  presentation?: 'timeline' | 'thumbnail';
}
