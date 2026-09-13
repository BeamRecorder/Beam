import type { ShapeClip } from '~/media/shared/composition-types';
import type { OutputCanvasSettings } from '../canvas/output-canvas';

export interface ShapeTimelinePreviewProps {
  clip: ShapeClip;
  canvas?: Pick<OutputCanvasSettings, 'width' | 'height'>;
}
