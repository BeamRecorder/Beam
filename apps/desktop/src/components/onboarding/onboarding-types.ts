export const ONBOARDING_STEPS = [
  'welcome',
  'recorderTitle',
  'quickTitle',
  'videoTitle',
  'imageTitle',
  'preferencesTitle',
] as const;
export type RecorderTourFeature =
  | 'screen'
  | 'region'
  | 'window'
  | 'camera'
  | 'mic'
  | 'systemAudio'
  | 'teleprompter'
  | 'tabs'
  | 'projects'
  | 'topbar';

export type VideoTourFeature = 'editing' | 'zooms' | 'backgrounds' | 'export';
