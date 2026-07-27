import { createI18n } from 'vue-i18n'
import enHUD from './en/HUD.json'
import enTopbarHUD from './en/TopbarHUD.json'
import enHudPreferences from './en/HudPreferences.json'
import enSettingsPanel from './en/SettingsPanel.json'
import enProjectPicker from './en/ProjectPicker.json'
import enCameraPreviewOverlay from './en/CameraPreviewOverlay.json'
import enShortcutPreferences from './en/ShortcutPreferences.json'
import enRecorderBar from './en/RecorderBar.json'
import enExporter from './en/exporter.json'
import enExportPopover from './en/ExportPopover.json'
import enTimelineToolbar from './en/TimelineToolbar.json'
import enTimelineTracks from './en/TimelineTracks.json'
import enTimelineVideoClip from './en/TimelineVideoClip.json'
import enSidebarPanel from './en/SidebarPanel.json'
import enCanvasPanel from './en/CanvasPanel.json'
import enBackgroundPresetComposer from './en/BackgroundPresetComposer.json'
import enCaptionClipPanel from './en/CaptionClipPanel.json'
import enCaptionPanel from './en/CaptionPanel.json'
import enClipPropertiesPanel from './en/ClipPropertiesPanel.json'
import enBorderAndFrameControls from './en/BorderAndFrameControls.json'
import enAudioClipPropertiesPanel from './en/AudioClipPropertiesPanel.json'
import frHUD from './fr/HUD.json'
import frTopbarHUD from './fr/TopbarHUD.json'
import frHudPreferences from './fr/HudPreferences.json'
import frSettingsPanel from './fr/SettingsPanel.json'
import frProjectPicker from './fr/ProjectPicker.json'
import frCameraPreviewOverlay from './fr/CameraPreviewOverlay.json'
import frShortcutPreferences from './fr/ShortcutPreferences.json'
import frRecorderBar from './fr/RecorderBar.json'
import frExporter from './fr/exporter.json'
import frExportPopover from './fr/ExportPopover.json'
import frTimelineToolbar from './fr/TimelineToolbar.json'
import frTimelineTracks from './fr/TimelineTracks.json'
import frTimelineVideoClip from './fr/TimelineVideoClip.json'
import frSidebarPanel from './fr/SidebarPanel.json'
import frCanvasPanel from './fr/CanvasPanel.json'
import frBackgroundPresetComposer from './fr/BackgroundPresetComposer.json'
import frCaptionClipPanel from './fr/CaptionClipPanel.json'
import frCaptionPanel from './fr/CaptionPanel.json'
import frClipPropertiesPanel from './fr/ClipPropertiesPanel.json'
import frBorderAndFrameControls from './fr/BorderAndFrameControls.json'
import frAudioClipPropertiesPanel from './fr/AudioClipPropertiesPanel.json'

const messages = {
  en: {
    HUD: enHUD,
    TopbarHUD: enTopbarHUD,
    HudPreferences: enHudPreferences,
    SettingsPanel: enSettingsPanel,
    ProjectPicker: enProjectPicker,
    CameraPreviewOverlay: enCameraPreviewOverlay,
    ShortcutPreferences: enShortcutPreferences,
    RecorderBar: enRecorderBar,
    exporter: enExporter,
    ExportPopover: enExportPopover,
    TimelineToolbar: enTimelineToolbar,
    TimelineTracks: enTimelineTracks,
    TimelineVideoClip: enTimelineVideoClip,
    SidebarPanel: enSidebarPanel,
    CanvasPanel: enCanvasPanel,
    BackgroundPresetComposer: enBackgroundPresetComposer,
    CaptionClipPanel: enCaptionClipPanel,
    CaptionPanel: enCaptionPanel,
    ClipPropertiesPanel: enClipPropertiesPanel,
    BorderAndFrameControls: enBorderAndFrameControls,
    AudioClipPropertiesPanel: enAudioClipPropertiesPanel,
  },
  fr: {
    HUD: frHUD,
    TopbarHUD: frTopbarHUD,
    HudPreferences: frHudPreferences,
    SettingsPanel: frSettingsPanel,
    ProjectPicker: frProjectPicker,
    CameraPreviewOverlay: frCameraPreviewOverlay,
    ShortcutPreferences: frShortcutPreferences,
    RecorderBar: frRecorderBar,
    exporter: frExporter,
    ExportPopover: frExportPopover,
    TimelineToolbar: frTimelineToolbar,
    TimelineTracks: frTimelineTracks,
    TimelineVideoClip: frTimelineVideoClip,
    SidebarPanel: frSidebarPanel,
    CanvasPanel: frCanvasPanel,
    BackgroundPresetComposer: frBackgroundPresetComposer,
    CaptionClipPanel: frCaptionClipPanel,
    CaptionPanel: frCaptionPanel,
    ClipPropertiesPanel: frClipPropertiesPanel,
    BorderAndFrameControls: frBorderAndFrameControls,
    AudioClipPropertiesPanel: frAudioClipPropertiesPanel,
  },
}

function detectLocale(): string {
  try {
    const stored = localStorage.getItem('locale')
    if (stored === 'en' || stored === 'fr') return stored
    const navLang = navigator.language
    if (navLang.startsWith('fr')) return 'fr'
  } catch {
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages,
})

export function initI18n() {
  return i18n
}

export function getCurrentLocale(): string {
  return i18n.global.locale.value
}

export function setCurrentLocale(locale: 'en' | 'fr') {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem('locale', locale)
  } catch {
  }
}

export function tNamespace(ns: string) {
  return (key: string, params?: Record<string, unknown>) =>
    params
      ? i18n.global.t(`${ns}.${key}`, params as Record<string, any>)
      : i18n.global.t(`${ns}.${key}`)
}