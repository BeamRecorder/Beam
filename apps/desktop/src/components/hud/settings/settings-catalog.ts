import { Accessibility, CodeXml, Info, Keyboard, RefreshCw, Settings2, Video, Palette, Film } from '@lucide/vue';
import { configurableActions } from '~/shortcuts/action-catalog';
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
    id: 'appearance',
    label: 'categoryAppearance',
    description: 'appearanceDescription',
    icon: Palette,
    color: 'var(--color-track-blur-highlight)',
  },
  {
    id: 'video-editor',
    label: 'categoryVideoEditor',
    description: 'videoEditorDescription',
    icon: Film,
    color: 'var(--color-track-video)',
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

export const SETTINGS_NAVIGATION_GROUPS = [
  {
    id: 'application',
    label: 'groupApplication',
    views: ['general', 'appearance', 'accessibility', 'shortcuts'],
  },
  { id: 'tools', label: 'groupTools', views: ['recording', 'video-editor'] },
  { id: 'support', label: null, views: ['developer', 'updates', 'about'] },
] as const;

export function settingsNavigationGroups(development: boolean) {
  const categories = settingsCategories(development);
  return SETTINGS_NAVIGATION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    categories: group.views.flatMap((id) => categories.filter((category) => category.id === id)),
  }));
}

const definitions = [
  ['launch-at-startup', 'general', 'HudPreferences.launchAtStartup', 'HudPreferences.launchAtStartupDescription'],
  ['minimize-to-tray', 'general', 'HudPreferences.minimizeToTray', 'HudPreferences.minimizeToTrayDescription'],
  ['always-on-top', 'recording', 'HudPreferences.alwaysOnTop', 'HudPreferences.recorderAlwaysOnTopDesc'],
  ['language', 'general', 'HudPreferences.language', 'HudPreferences.chooseLanguage'],
  [
    'theme-mode',
    'appearance',
    'AppearanceSettings.themeMode',
    'AppearanceSettings.subtitle',
    'AppearanceSettings.light',
    'AppearanceSettings.dark',
    'AppearanceSettings.system',
  ],
  ['theme-presets', 'appearance', 'AppearanceSettings.themePresets', 'AppearanceSettings.themeCustomization'],
  ['primary-color', 'appearance', 'AppearanceSettings.primaryColor', 'AppearanceSettings.themeCustomization'],
  ['secondary-color', 'appearance', 'AppearanceSettings.secondaryColor', 'AppearanceSettings.themeCustomization'],
  ['corner-radius', 'appearance', 'AppearanceSettings.cornerRadius', 'AppearanceSettings.custom'],
  [
    'surface-tone',
    'appearance',
    'AppearanceSettings.surfaceTone',
    'AppearanceSettings.toneNeutral',
    'AppearanceSettings.toneDefault',
    'AppearanceSettings.toneSlate',
    'AppearanceSettings.toneDeep',
  ],
  ['reset-theme', 'appearance', 'AppearanceSettings.resetDefault', 'AppearanceSettings.themeCustomization'],
  ['ui-scaling', 'appearance', 'AppearanceSettings.uiScale', 'AppearanceSettings.uiScaleHint'],
  [
    'timeline-insertion',
    'video-editor',
    'EditorAccessibility.doubleClick',
    'EditorAccessibility.doubleClickDescription',
  ],
  ['onboarding', 'general', 'HudPreferences.onboarding', 'HudPreferences.onboardingDesc'],
  ['video-export-backend', 'video-editor', 'ExportPopover.experimentalFfmpeg', 'ExportPopover.experimentalFfmpegDesc'],
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
  ['projects-directory', 'general', 'DirectoryPreferences.projects', 'DirectoryPreferences.projectsDescription'],
  [
    'exports-directory',
    'general',
    'DirectoryPreferences.exports',
    'DirectoryPreferences.exportsDescription',
    'DirectoryPreferences.lastUsed',
  ],
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
  ['quickSnip.recordScreen', 'quickSnipRecordScreen'],
  ['quickSnip.recordRegion', 'quickSnipRecordRegion'],
  ['quickSnip.recordWindow', 'quickSnipRecordWindow'],
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
  platform = 'unknown',
): SettingsSearchEntry[] {
  const entries: SettingsSearchEntry[] = definitions
    .filter(([, view]) => development || view !== 'developer')
    .filter(([id]) => id !== 'video-export-backend' || platform === 'linux')
    .map(([id, view, title, description, ...options]) => ({
      id,
      view,
      title: translate(title),
      description: translate(description),
      terms: [english(title), english(description), ...options.flatMap((key) => [translate(key), english(key)])],
    }));
  for (const action of configurableActions()) {
    const legacy = SHORTCUT_SEARCH_KEYS.find(([id]) => id === action.id);
    const description = legacy ? `ShortcutPreferences.${legacy[1]}Desc` : 'ActionShortcuts.editHint';
    entries.push({
      id: action.id,
      view: 'shortcuts',
      title: translate(action.label),
      description: translate(description),
      terms: [english(action.label), english(description), action.id],
    });
  }
  return entries;
}
