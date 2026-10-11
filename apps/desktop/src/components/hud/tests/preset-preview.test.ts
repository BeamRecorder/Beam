import { describe, expect, it } from 'vitest';
import { presetPreviewSnapshot } from '../preset-preview';
import type { EditorPreset } from '~/api/types/editor-preset';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
const preset = (): EditorPreset => ({
  id: 'custom',
  name: 'Custom',
  protected: false,
  updatedAt: '',
  settings: {
    editor: { schemaVersion: 1 },
    devices: {},
    export: { format: 'mp4' },
    quickSnip: { automaticZoom: true },
  },
});
describe('preset preview snapshot', () => {
  it.each(['video', 'screenshot'] as const)(
    'constructs a labelled %s sample without mutating the saved preset',
    (kind) => {
      const p = preset(),
        before = JSON.stringify(p);
      const result = presetPreviewSnapshot(p, kind, null);
      expect(JSON.stringify(p)).toBe(before);
      expect(result.composition.clips[0]).toMatchObject({ kind: kind === 'video' ? 'screen' : 'image', enabled: true });
      expect(result.canvas.width).toBeLessThanOrEqual(720);
      expect(result.background).toBeNull();
      expect(result.zooms).toEqual([]);
      expect(result.cursor.available).toBe(false);
    },
  );
  it('preserves the saved framing, source placement and watermark at bounded preview resolution', () => {
    const p = preset();
    p.settings.editor.presentation = {
      canvas: {
        ...DEFAULT_OUTPUT_CANVAS,
        preset: 'custom',
        width: 1000,
        height: 2000,
        showBackground: true,
        watermark: { ...DEFAULT_OUTPUT_CANVAS.watermark!, enabled: true },
      },
      selectedBackgroundId: null,
      cursor: createDefaultCursorPresentation(),
    };
    p.settings.editor.visual = {
      screen: {
        transform: { x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
        appearance: { ...createDefaultClipAppearance('screen'), frame: 'safari', borderEnabled: true, borderWidth: 7 },
        playbackRate: 1,
        isMirrored: true,
        isMirroredY: false,
        rotation: 15,
        cameraLayoutPreset: 'custom',
        cameraFramingPreset: 'custom',
        transitions: { entry: { preset: { kind: 'fade' }, durationMs: 200 }, exit: null },
      },
    };
    const snapshot = presetPreviewSnapshot(p, 'video', { id: 'red', name: 'Red', kind: 'color', color: '#ee0000' });
    expect(snapshot.canvas).toMatchObject({
      width: 360,
      height: 720,
      showBackground: true,
      watermark: { enabled: true },
    });
    expect(snapshot.referenceCanvas).toEqual({ width: 1000, height: 2000 });
    expect(snapshot.composition.clips[0]).toMatchObject({
      rotation: 15,
      isMirrored: true,
      appearance: { frame: 'safari', borderWidth: 7 },
      transform: { x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
      transitions: { entry: null, exit: null },
    });
    expect(snapshot.background).toEqual({ kind: 'color', color: '#ee0000' });
  });
  it.each(['image', 'video'] as const)('retains a real %s background source and blur', (kind) => {
    const p = preset();
    p.settings.editor.presentation = {
      canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true },
      cursor: createDefaultCursorPresentation(),
      selectedBackgroundId: 'asset',
      blurPercent: 42,
    };
    expect(
      presetPreviewSnapshot(p, 'video', {
        id: 'asset',
        name: 'Asset',
        kind,
        path: 'project-media:asset',
        extension: 'webp',
      }),
    ).toMatchObject({ background: { kind, src: 'project-media:asset' }, blurPercent: 42 });
  });
  it('retains the complete saved gradient', () => {
    const gradient = {
      type: 'linear' as const,
      angle: 120,
      stops: [
        { id: 'a', position: 0, color: '#123456', alpha: 1 },
        { id: 'b', position: 1, color: '#fedcba', alpha: 0.5 },
      ],
    };
    expect(
      presetPreviewSnapshot(preset(), 'screenshot', { kind: 'gradient', id: 'custom', name: 'Custom', gradient })
        .background,
    ).toEqual({ kind: 'gradient', gradient });
  });
});
