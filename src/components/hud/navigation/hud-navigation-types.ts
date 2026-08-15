export type HudSettingsView = 'general' | 'shortcuts' | 'about';

export type HudNavigationEntry =
  { view: 'hud' } | { view: 'projects' } | { view: 'settings'; subview: HudSettingsView };

export interface HudNavigationState {
  showSettings: boolean;
  settingsView: HudSettingsView;
  showProjectPicker: boolean;
}
