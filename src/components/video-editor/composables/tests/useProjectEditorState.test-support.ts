import type { ProjectEditorState } from '../../../../api/types/capture-api';
import { createDefaultCursorPresentation } from '../../../../api/types/cursor-presentation';
import type { ZoomElement } from '../../zoom/zoom-types';

type CursorPresentation = ProjectEditorState['presentation']['cursor'];

export const existingZoom: ZoomElement = {
  id: 'project-zoom',
  sessionId: 'project-session',
  startMs: 250,
  endMs: 1_100,
  focus: { cx: 0.35, cy: 0.65 },
  depth: 4,
  mode: 'manual',
};

export const globalCursor = (): CursorPresentation => ({
  ...createDefaultCursorPresentation(),
  selection: { packId: 'pack:global', mode: 'fixed', cursorId: 'global-pointer' },
  size: 64,
  color: '#123456',
  shadow: { enabled: false, blur: 13, color: '#654321', direction: 'top-left' },
  clickEffects: {
    left: {
      springEnabled: false,
      springIntensity: 17,
      rippleEnabled: true,
      rippleStyle: 'double',
      rippleSize: 42,
      rippleColor: '#112233',
    },
    right: {
      springEnabled: true,
      springIntensity: 83,
      rippleEnabled: false,
      rippleStyle: 'double',
      rippleSize: 67,
      rippleColor: '#445566',
    },
  },
  motion: { preset: 'custom', smoothing: 0.31, springMassMultiplier: 1.72, motionBlur: 0.18 },
});

export const projectCursor = (): CursorPresentation => ({
  ...createDefaultCursorPresentation(),
  selection: { packId: 'pack:project', mode: 'fixed', cursorId: 'project-pointer' },
  size: 29,
  color: '#fedcba',
  shadow: { enabled: true, blur: 4, color: '#abcdef', direction: 'bottom-right' },
  clickEffects: {
    left: {
      springEnabled: true,
      springIntensity: 4,
      rippleEnabled: false,
      rippleStyle: 'single',
      rippleSize: 12,
      rippleColor: '#abcdef',
    },
    right: {
      springEnabled: false,
      springIntensity: 96,
      rippleEnabled: true,
      rippleStyle: 'single',
      rippleSize: 78,
      rippleColor: '#fedcba',
    },
  },
  motion: { preset: 'focused', smoothing: 0.91, springMassMultiplier: 0.61, motionBlur: 0.73 },
});
