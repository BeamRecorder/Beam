import { Accessibility, CodeXml, Info, Keyboard, RefreshCw, Settings2, Video } from '@lucide/vue';
import type { SettingsSearchEntry } from './settings-types';

export const SETTINGS_CATEGORIES = [
  {
    id: 'general',
    label: 'categoryGeneral',
    description: 'generalDescription',
    icon: Settings2,
    color: 'var(--text-secondary)',
  },
  {
    id: 'recording',
    label: 'categoryRecording',
    description: 'recordingDescription',
    icon: Video,
    color: 'var(--color-track-cursor)',
  },
  {
    id: 'accessibility',
    label: 'categoryAccessibility',
    description: 'accessibilityDescription',
    icon: Accessibility,
    color: 'var(--color-track-video)',
  },
  {
    id: 'shortcuts',
    label: 'keyboardShortcuts',
    description: 'shortcutsDescription',
    icon: Keyboard,
    color: 'var(--color-track-blur-highlight)',
  },
  {
    id: 'updates',
    label: 'categoryUpdates',
    description: 'updatesDescription',
    icon: RefreshCw,
    color: 'var(--color-success)',
  },
  {
    id: 'about',
    label: 'categoryAbout',
    description: 'aboutDesc',
    icon: Info,
    color: 'var(--color-track-video)',
  },
  {
    id: 'developer',
    label: 'categoryDeveloper',
    description: 'developerDescription',
    icon: CodeXml,
    color: 'var(--color-track-blur-highlight)',
  },
] as const;

export const settingsCategories = (development: boolean) =>
  SETTINGS_CATEGORIES.filter(({ id }) => development || id !== 'developer');

const definitions = [
  ['always-on-top', 'recording', 'HudPreferences.alwaysOnTop', 'HudPreferences.recorderAlwaysOnTopDesc'],
  ['language', 'general', 'HudPreferences.language', 'HudPreferences.chooseLanguage'],
  [
    'theme-mode',
    'general',
    'AppearanceSettings.themeMode',
    'AppearanceSettings.subtitle',
    'AppearanceSettings.light',
    'AppearanceSettings.dark',
    'AppearanceSettings.system',
  ],
  ['theme-presets', 'general', 'AppearanceSettings.themePresets', 'AppearanceSettings.themeCustomization'],
  ['primary-color', 'general', 'AppearanceSettings.primaryColor', 'AppearanceSettings.themeCustomization'],
  ['secondary-color', 'general', 'AppearanceSettings.secondaryColor', 'AppearanceSettings.themeCustomization'],
  ['corner-radius', 'general', 'AppearanceSettings.cornerRadius', 'AppearanceSettings.custom'],
  [
    'surface-tone',
    'general',
    'AppearanceSettings.surfaceTone',
    'AppearanceSettings.toneNeutral',
    'AppearanceSettings.toneDefault',
    'AppearanceSettings.toneSlate',
    'AppearanceSettings.toneDeep',
  ],
  ['reset-theme', 'general', 'AppearanceSettings.resetDefault', 'AppearanceSettings.themeCustomization'],
  ['onboarding', 'general', 'HudPreferences.onboarding', 'HudPreferences.onboardingDesc'],
  [
    'recorder-bar',
    'recording',
    'HudPreferences.recorderBar',
    'HudPreferences.visibilityWhileRecording',
    'HudPreferences.alwaysVisible',
    'HudPreferences.autoFade',
    'HudPreferences.hiddenUntilHovered',
  ],
  ['show-real-cursor', 'recording', 'CursorRecording.showRealCursor', 'CursorRecording.description'],
  [
    'hide-taskbar',
    'recording',
    'ScreenRegionOverlay.hideTaskbar',
    'ScreenRegionOverlay.hideDock',
    'ScreenRegionOverlay.captureOnly',
  ],
  ['hide-desktop-icons', 'recording', 'ScreenRegionOverlay.hideDesktopIcons', 'ScreenRegionOverlay.captureOnly'],
  ['countdown', 'recording', 'HudPreferences.countdown', 'HudPreferences.selectDelay', 'HudPreferences.off'],
  [
    'interactions',
    'accessibility',
    'HudPreferences.recordInteractions',
    'HudPreferences.recordInteractionsDescription',
    'HudPreferences.recordInteractionsLinux',
    'HudPreferences.recordInteractionsDescriptionLinux',
    'HudPreferences.interactionAccessDescriptionLinux',
    'HudPreferences.interactionAccessUnavailableDescription',
  ],
  ['spell-check', 'accessibility', 'HudPreferences.spellCheck', 'HudPreferences.spellCheckDescription'],
  [
    'updates',
    'updates',
    'Updates.checkForUpdates',
    'Updates.title',
    'Updates.download',
    'Updates.restart',
    'Updates.viewChangelog',
  ],
  [
    'about',
    'about',
    'HudPreferences.about',
    'HudPreferences.aboutDescriptionTitle',
    'HudPreferences.aboutDescriptionText',
    'HudPreferences.version',
  ],
  ['system-info', 'about', 'SettingsPanel.copySysInfo', 'HudPreferences.aboutDesc'],
  ['socials', 'about', 'Socials.title', 'Socials.description', 'Socials.discord', 'Socials.github'],
  ['devtools', 'developer', 'SettingsPanel.devToolsTool', 'SettingsPanel.devToolsDesc', 'SettingsPanel.openDevTools'],
  [
    'mascot-lab',
    'developer',
    'HudPreferences.mascotLab',
    'HudPreferences.mascotLabDescription',
    'HudPreferences.openMascotLab',
  ],
] as const;

export const SHORTCUT_SEARCH_KEYS = [
  ['quickSnip.toggle', 'quickSnip'],
  ['hud.startStopRecording', 'startStopRecording'],
  ['hud.playPause', 'pauseResume'],
  ['hud.toggleMic', 'micOnOff'],
  ['hud.toggleCamera', 'cameraOnOff'],
  ['hud.toggleSystemAudio', 'systemAudioOnOff'],
  ['teleprompter.toggleVisibility', 'teleprompterVisibility'],
  ['teleprompter.toggleAutoscroll', 'teleprompterAutoscroll'],
  ['teleprompter.nextLine', 'teleprompterNextLine'],
  ['teleprompter.previousLine', 'teleprompterPreviousLine'],
] as const;

export function settingsSearchEntries(
  translate: (key: string) => string,
  english: (key: string) => string,
  development = import.meta.env.DEV,
): SettingsSearchEntry[] {
  const entries: SettingsSearchEntry[] = definitions
    .filter(([, view]) => development || view !== 'developer')
    .map(([id, view, title, description, ...options]) => ({
      id,
      view,
      title: translate(title),
      description: translate(description),
      terms: [english(title), english(description), ...options.flatMap((key) => [translate(key), english(key)])],
    }));
  for (const [id, key] of SHORTCUT_SEARCH_KEYS) {
    const title = `ShortcutPreferences.${key}`;
    const description = `${title}Desc`;
    entries.push({
      id,
      view: 'shortcuts',
      title: translate(title),
      description: translate(description),
      terms: [english(title), english(description)],
    });
  }
  return entries;
}
