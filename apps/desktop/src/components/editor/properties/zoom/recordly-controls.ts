import type { RecordlyNumericControl, RecordlyBlurControl } from './recordly-control-types';
export const RECORDLY_CONTROLS: RecordlyNumericControl[] = [
  { key: 'zoomInDurationMs', label: 'recordlyEntry', min: 60, max: 4000, step: 1, unit: 'ms' },
  { key: 'zoomOutDurationMs', label: 'recordlyExit', min: 60, max: 4000, step: 1, unit: 'ms' },
  { key: 'defaultDurationMs', label: 'recordlyDuration', min: 1, max: 10000, step: 1, unit: 'ms' },
  { key: 'zoomSmoothness', label: 'recordlySmoothness', min: 0, max: 1, step: 0.01 },
  { key: 'cameraSpringStiffnessMultiplier', label: 'recordlyStiffness', min: 0.25, max: 3, step: 0.01, unit: '×' },
  { key: 'cameraSpringDampingMultiplier', label: 'recordlyDamping', min: 0.25, max: 3, step: 0.01, unit: '×' },
  { key: 'cameraSpringMassMultiplier', label: 'recordlyMass', min: 0.25, max: 3, step: 0.01, unit: '×' },
];

export const RECORDLY_BLUR_CONTROLS: RecordlyBlurControl[] = [
  { key: 'panVelocityThreshold', label: 'recordlyPanThreshold', min: 0, max: 240, step: 1, unit: 'px/s' },
  { key: 'zoomVelocityThreshold', label: 'recordlyZoomThreshold', min: 0, max: 0.4, step: 0.001, unit: '/s' },
  { key: 'maxDirectionalBlurPx', label: 'recordlyDirectionalMax', min: 0, max: 96, step: 0.1, unit: 'px' },
  { key: 'maxRadialBlurStrength', label: 'recordlyRadialMax', min: 0, max: 1.5, step: 0.01 },
];
