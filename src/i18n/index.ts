import { createI18n } from 'vue-i18n';
import enHUD from './en/HUD.json';
import enTopbarHUD from './en/TopbarHUD.json';
import enHudPreferences from './en/HudPreferences.json';
import enSettingsPanel from './en/SettingsPanel.json';
import enSocials from './en/Socials.json';
import enUpdates from './en/Updates.json';
import enProjectPicker from './en/ProjectPicker.json';
import enCameraPreviewOverlay from './en/CameraPreviewOverlay.json';
import enShortcutPreferences from './en/ShortcutPreferences.json';
import enRecorderBar from './en/RecorderBar.json';
import enExporter from './en/exporter.json';
import enExportPopover from './en/ExportPopover.json';
import enTimelineToolbar from './en/TimelineToolbar.json';
import enTimelineTracks from './en/TimelineTracks.json';
import enTimelineVideoClip from './en/TimelineVideoClip.json';
import enSidebarPanel from './en/SidebarPanel.json';
import enCanvasPanel from './en/CanvasPanel.json';
import enBackgroundPresetComposer from './en/BackgroundPresetComposer.json';
import enCaptionClipPanel from './en/CaptionClipPanel.json';
import enCaptionPanel from './en/CaptionPanel.json';
import enClipPropertiesPanel from './en/ClipPropertiesPanel.json';
import enBorderAndFrameControls from './en/BorderAndFrameControls.json';
import enAudioClipPropertiesPanel from './en/AudioClipPropertiesPanel.json';
import enZoomPanel from './en/ZoomPanel.json';
import enAudioPanel from './en/AudioPanel.json';
import enShadowDirectionGroup from './en/ShadowDirectionGroup.json';
import enTopbar from './en/Topbar.json';
import enCursorPanel from './en/CursorPanel.json';
import enVideoProjectEdition from './en/VideoProjectEdition.json';
import enVideoEditor from './en/VideoEditor.json';
import enPropertiesPanel from './en/PropertiesPanel.json';
import enEditorCanvas from './en/EditorCanvas.json';
import enCanvasToolbar from './en/CanvasToolbar.json';
import enUndoRedoToast from './en/UndoRedoToast.json';
import frHUD from './fr/HUD.json';
import frTopbarHUD from './fr/TopbarHUD.json';
import frHudPreferences from './fr/HudPreferences.json';
import frSettingsPanel from './fr/SettingsPanel.json';
import frSocials from './fr/Socials.json';
import frUpdates from './fr/Updates.json';
import frProjectPicker from './fr/ProjectPicker.json';
import frCameraPreviewOverlay from './fr/CameraPreviewOverlay.json';
import frShortcutPreferences from './fr/ShortcutPreferences.json';
import frRecorderBar from './fr/RecorderBar.json';
import frExporter from './fr/exporter.json';
import frExportPopover from './fr/ExportPopover.json';
import frTimelineToolbar from './fr/TimelineToolbar.json';
import frTimelineTracks from './fr/TimelineTracks.json';
import frTimelineVideoClip from './fr/TimelineVideoClip.json';
import frSidebarPanel from './fr/SidebarPanel.json';
import frCanvasPanel from './fr/CanvasPanel.json';
import frBackgroundPresetComposer from './fr/BackgroundPresetComposer.json';
import frCaptionClipPanel from './fr/CaptionClipPanel.json';
import frCaptionPanel from './fr/CaptionPanel.json';
import frClipPropertiesPanel from './fr/ClipPropertiesPanel.json';
import frBorderAndFrameControls from './fr/BorderAndFrameControls.json';
import frAudioClipPropertiesPanel from './fr/AudioClipPropertiesPanel.json';
import frZoomPanel from './fr/ZoomPanel.json';
import frAudioPanel from './fr/AudioPanel.json';
import frShadowDirectionGroup from './fr/ShadowDirectionGroup.json';
import frTopbar from './fr/Topbar.json';
import frCursorPanel from './fr/CursorPanel.json';
import frVideoProjectEdition from './fr/VideoProjectEdition.json';
import frVideoEditor from './fr/VideoEditor.json';
import frPropertiesPanel from './fr/PropertiesPanel.json';
import frEditorCanvas from './fr/EditorCanvas.json';
import frCanvasToolbar from './fr/CanvasToolbar.json';
import frUndoRedoToast from './fr/UndoRedoToast.json';
import enBackgroundCatalog from './en/backgroundCatalog.json';
import enWhisperTypes from './en/whisperTypes.json';
import frBackgroundCatalog from './fr/backgroundCatalog.json';
import frWhisperTypes from './fr/whisperTypes.json';
import enTeleprompter from './en/Teleprompter.json';
import frTeleprompter from './fr/Teleprompter.json';
import enScreenRegionOverlay from './en/ScreenRegionOverlay.json';
import frScreenRegionOverlay from './fr/ScreenRegionOverlay.json';
import enTray from './en/Tray.json';
import frTray from './fr/Tray.json';

const messages = {
  en: {
    HUD: enHUD,
    TopbarHUD: enTopbarHUD,
    HudPreferences: enHudPreferences,
    SettingsPanel: enSettingsPanel,
    Socials: enSocials,
    Updates: enUpdates,
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
    ZoomPanel: enZoomPanel,
    AudioPanel: enAudioPanel,
    ShadowDirectionGroup: enShadowDirectionGroup,
    Topbar: enTopbar,
    CursorPanel: enCursorPanel,
    VideoProjectEdition: enVideoProjectEdition,
    VideoEditor: enVideoEditor,
    PropertiesPanel: enPropertiesPanel,
    EditorCanvas: enEditorCanvas,
    CanvasToolbar: enCanvasToolbar,
    UndoRedoToast: enUndoRedoToast,
    backgroundCatalog: enBackgroundCatalog,
    whisperTypes: enWhisperTypes,
    Teleprompter: enTeleprompter,
    ScreenRegionOverlay: enScreenRegionOverlay,
    Tray: enTray,
  },
  fr: {
    HUD: frHUD,
    TopbarHUD: frTopbarHUD,
    HudPreferences: frHudPreferences,
    SettingsPanel: frSettingsPanel,
    Socials: frSocials,
    Updates: frUpdates,
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
    ZoomPanel: frZoomPanel,
    AudioPanel: frAudioPanel,
    ShadowDirectionGroup: frShadowDirectionGroup,
    Topbar: frTopbar,
    CursorPanel: frCursorPanel,
    VideoProjectEdition: frVideoProjectEdition,
    VideoEditor: frVideoEditor,
    PropertiesPanel: frPropertiesPanel,
    EditorCanvas: frEditorCanvas,
    CanvasToolbar: frCanvasToolbar,
    UndoRedoToast: frUndoRedoToast,
    backgroundCatalog: frBackgroundCatalog,
    whisperTypes: frWhisperTypes,
    Teleprompter: frTeleprompter,
    ScreenRegionOverlay: frScreenRegionOverlay,
    Tray: frTray,
  },
};

function detectLocale(): string {
  try {
    const stored = localStorage.getItem('locale');
    if (stored === 'en' || stored === 'fr') return stored;
    const navLang = navigator.language;
    if (navLang.startsWith('fr')) return 'fr';
  } catch {}
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages,
});

export function initI18n() {
  return i18n;
}

export function getCurrentLocale(): string {
  return i18n.global.locale.value;
}

export function setCurrentLocale(locale: 'en' | 'fr') {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem('locale', locale);
  } catch {}
}

export function tNamespace(ns: string) {
  return (key: string, params?: Record<string, unknown>) =>
    params ? i18n.global.t(`${ns}.${key}`, params as Record<string, any>) : i18n.global.t(`${ns}.${key}`);
}
