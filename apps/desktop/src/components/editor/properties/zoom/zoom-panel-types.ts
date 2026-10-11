import type {
  ZoomAutoFollowSettings,
  ZoomElement,
  ZoomMotionBlurSettings,
  ZoomStyle,
} from '@beam/engine/zoom/zoom-types';
import type { ProjectEditorData } from '~/api/types/capture-api';

export interface ZoomGenerationButtonProps {
  canGenerate: boolean;
  hasAutomaticZooms: boolean;
  editorData?: Pick<ProjectEditorData, 'sessionId' | 'cursor'> | null;
}

export interface ZoomPanelProps {
  selectedZoom: ZoomElement | null;
  canGenerate: boolean;
  hasAutomaticZooms: boolean;
  motionBlur: ZoomMotionBlurSettings;
  autoFollow?: ZoomAutoFollowSettings;
  canvasSize?: { width: number; height: number };
  still?: boolean;
  editorData?: ZoomGenerationButtonProps['editorData'];
}
export interface ZoomPanelEmits {
  (event: 'update', value: ZoomElement): void;
  (event: 'delete'): void;
  (event: 'generate', style: ZoomStyle): void;
  (event: 'update:motionBlur', value: ZoomMotionBlurSettings): void;
  (event: 'update:autoFollow', value: ZoomAutoFollowSettings): void;
}
