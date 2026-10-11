import type { EditorPresetDocument, EditorPresetSettings } from '~/api/types/editor-preset';
import { normalizeOutputCanvas } from '@beam/engine/layout/output-canvas';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { BackgroundValue } from '@beam/engine/shared/background-types';

export const previewSettings = (background: BackgroundValue | null = null): EditorPresetSettings => ({
  editor: {
    schemaVersion: 1,
    presentation: {
      canvas: normalizeOutputCanvas({ showBackground: true }),
      selectedBackgroundId: background?.id ?? null,
      background,
    } as EditorPresetSettings['editor']['presentation'],
    visual: {
      image: {
        transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        appearance: { ...createDefaultClipAppearance('image'), shadowColor: '#ff0000' },
        isMirrored: true,
        isMirroredY: false,
        rotation: 10,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        cameraLayoutPreset: 'custom',
        cameraFramingPreset: 'fit',
      },
    },
  },
  devices: {},
  export: { format: 'png' },
  quickSnip: { automaticZoom: false },
});

export const previewDocument = (): EditorPresetDocument => ({
  schemaVersion: 1,
  activePresetId: 'default',
  presets: [
    { id: 'default', name: 'Default', protected: true, updatedAt: '', settings: previewSettings() },
    {
      id: 'red',
      name: 'Red',
      protected: false,
      updatedAt: '',
      settings: previewSettings({ id: 'red', name: 'Red', kind: 'color', color: '#ff0000' }),
    },
  ],
});
