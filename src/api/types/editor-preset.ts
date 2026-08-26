import type { EditorPreferenceDefaults } from '~/components/video-editor/composables/editor-default-types';

export interface EditorPresetSettings {
  editor: EditorPreferenceDefaults;
  devices: Record<string, unknown>;
  export: { format?: 'mp4' | 'webm'; [key: string]: unknown };
  quickSnip: { automaticZoom: boolean };
}

export interface EditorPreset {
  id: string;
  name: string;
  protected: boolean;
  updatedAt: string;
  settings: EditorPresetSettings;
}

export interface EditorPresetDocument {
  schemaVersion: 1;
  activePresetId: string;
  presets: EditorPreset[];
}
