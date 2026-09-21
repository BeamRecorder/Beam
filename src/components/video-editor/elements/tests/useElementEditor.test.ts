import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import type { ShapeLayerStyle } from '~/media/shared/shape-layer-types';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import type { ColorFill } from '~/media/shared/color-fill-types';
import type { DrawingSettings, DrawnElement } from '~/media/shared/element-types';
import type { ElementEditorContext, ElementEditorOptions } from '../element-editor-types';
import { provideElementEditor, useElementEditor } from '../useElementEditor';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => `translated:${key}` }),
}));

const createClip = (id: string, overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id,
  kind: 'shape',
  assetId: '',
  name: id,
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  trackId: id,
  ...normalizeShapeLayerStyle({ family: 'shape' }),
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
  ...overrides,
});

interface HarnessOptions {
  initialLayers?: ShapeClip[];
  selectedId?: string | null;
  canInteract?: boolean | null;
  showLayers?: boolean;
  timing?: { startMs: number; durationMs: number };
}

const wrappers: VueWrapper[] = [];

const mountEditor = (configuration: HarnessOptions = {}) => {
  const layers = shallowRef<ShapeClip[]>([...(configuration.initialLayers ?? [])]);
  const selectedId = ref<string | null>(configuration.selectedId ?? null);
  const canInteract = configuration.canInteract === null ? null : ref(configuration.canInteract ?? true);
  const timing = ref(configuration.timing ?? { startMs: 1_250, durationMs: 4_000 });
  const insert = vi.fn((clip: ShapeClip) => {
    layers.value = [...layers.value, clip];
  });
  const select = vi.fn((id: string) => {
    selectedId.value = id;
  });
  const update = vi.fn((id: string, patch: Partial<ShapeLayerStyle>) => {
    layers.value = layers.value.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip));
  });
  const remove = vi.fn((id: string) => {
    layers.value = layers.value.filter((clip) => clip.id !== id);
    if (selectedId.value === id) selectedId.value = null;
  });
  const options: ElementEditorOptions = {
    layers: () => layers.value,
    selectedId: () => selectedId.value,
    select,
    insert,
    update,
    remove,
    timing: () => timing.value,
    ...(configuration.showLayers === undefined ? {} : { showLayers: configuration.showLayers }),
    ...(canInteract ? { canInteract: () => canInteract.value } : {}),
  };

  let context!: ElementEditorContext;
  let injected: ElementEditorContext | null = null;
  const Consumer = defineComponent({
    setup() {
      injected = useElementEditor();
      return () => h('span');
    },
  });
  const Host = defineComponent({
    setup() {
      context = provideElementEditor(options);
      return () => h(Consumer);
    },
  });
  const wrapper = mount(Host);
  wrappers.push(wrapper);

  return { context, injected, layers, selectedId, canInteract, timing, insert, select, update, remove };
};

beforeEach(() => {
  let nextId = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `element-${++nextId}` });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe('useElementEditor', () => {
  it('returns null without a provider and injects the reactive editor context into descendants', async () => {
    let outside: ElementEditorContext | null = null;
    const wrapper = mount(
      defineComponent({
        setup() {
          outside = useElementEditor();
          return () => null;
        },
      }),
    );
    wrappers.push(wrapper);
    expect(outside).toBeNull();

    const first = createClip('first');
    const second = createClip('second');
    const editor = mountEditor({ initialLayers: [first, second], selectedId: 'first', showLayers: true });
    expect(editor.injected).toBe(editor.context);
    expect(editor.context.showLayers).toBe(true);
    expect(editor.context.layers.value).toEqual([first, second]);
    expect(editor.context.selected.value).toBe(first);

    editor.layers.value = [second];
    editor.selectedId.value = 'second';
    await nextTick();

    expect(editor.context.layers.value).toEqual([second]);
    expect(editor.context.selected.value).toBe(second);
  });

  it.each([
    ['shape', 'rectangle', 0.4, 0.3],
    ['arrow', 'arrow', 0.2, 0.055],
    ['text', 'text', 0.4, 0.16],
  ] as const)('inserts a %s with current timing and selects it', (family, preset, width, height) => {
    const editor = mountEditor({ timing: { startMs: 850, durationMs: 3_250 } });

    editor.context.add(family);

    expect(editor.insert).toHaveBeenCalledOnce();
    const inserted = editor.insert.mock.calls[0]![0];
    expect(inserted).toMatchObject({
      id: 'element-1',
      trackId: 'element-1',
      kind: 'shape',
      family,
      preset,
      name: `translated:${family}`,
      timelineStartMs: 850,
      timelineDurationMs: 3_250,
      sourceDurationMs: 3_250,
      transform: { x: 0.3, y: 0.3, width, height },
    });
    expect(editor.select).toHaveBeenLastCalledWith('element-1');
    expect(editor.context.selected.value?.id).toBe('element-1');
    expect(editor.context.drawingMode.value).toBe(false);

    if (family === 'text') {
      expect(inserted.text?.content).toBe('translated:newText');
      expect(editor.context.editing.value?.id).toBe('element-1');
    } else {
      expect(inserted.text).toBeUndefined();
      expect(editor.context.editing.value).toBeNull();
    }
  });

  it('uses compact thin defaults for new arrows without changing saved arrow layers', () => {
    const savedArrow = createClip('saved-arrow', {
      family: 'arrow',
      preset: 'arrow',
      arrowThickness: 36,
      arrowHeadSize: 38,
      transform: { x: 0.1, y: 0.2, width: 0.4, height: 0.16 },
    });
    const savedArrowBefore = structuredClone(savedArrow);
    const editor = mountEditor({ initialLayers: [savedArrow], selectedId: savedArrow.id });

    editor.context.add('arrow');

    const inserted = editor.insert.mock.calls[0]![0];
    expect(inserted).toMatchObject({
      family: 'arrow',
      preset: 'arrow',
      arrowThickness: 12,
      arrowHeadSize: 18,
      transform: { width: 0.2, height: 0.055 },
    });
    expect(savedArrow).toEqual(savedArrowBefore);
  });

  it('inserts an unfilled outlined rectangle for new shape annotations', () => {
    const editor = mountEditor();

    editor.context.add('shape');

    const inserted = editor.insert.mock.calls[0]![0];
    expect(inserted).toMatchObject({
      family: 'shape',
      preset: 'rectangle',
      fillEnabled: false,
      borderColor: '#ff5a1f',
      borderWidth: 8,
      cornerRadius: 0,
    });
    expect(inserted).not.toHaveProperty('fill');
  });

  it('toggles drawing mode and inserts completed points using current duration and drawing color', () => {
    const editor = mountEditor({ timing: { startMs: 700, durationMs: 1_900 } });
    editor.context.add('drawing');
    expect(editor.context.drawingMode.value).toBe(true);
    expect(editor.insert).not.toHaveBeenCalled();

    editor.context.add('drawing');
    expect(editor.context.drawingMode.value).toBe(false);
    editor.context.add('drawing');
    editor.context.drawingSettings.value.color = '#123456';

    const drawing: DrawnElement = {
      transform: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 45,
        strokeWidth: 12,
      },
    };
    editor.context.addDrawing(drawing);

    const inserted = editor.insert.mock.calls[0]![0];
    expect(inserted).toMatchObject({
      family: 'drawing',
      preset: 'freehand',
      fillColor: '#123456',
      timelineStartMs: 700,
      timelineDurationMs: 1_900,
      sourceDurationMs: 1_900,
      transform: drawing.transform,
      drawing: drawing.drawing,
    });
    expect(editor.select).toHaveBeenLastCalledWith(inserted.id);
    expect(editor.context.drawingMode.value).toBe(true);
  });

  it('keeps drawing mode active and selects each completed drawing', () => {
    const editor = mountEditor();
    editor.context.add('drawing');
    expect(editor.context.drawingMode.value).toBe(true);

    const drawing: DrawnElement = {
      transform: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 45,
        strokeWidth: 12,
      },
    };
    editor.context.addDrawing(drawing);

    const inserted = editor.insert.mock.calls[0]![0];
    expect(editor.insert).toHaveBeenCalledOnce();
    expect(inserted).toMatchObject({ family: 'drawing', preset: 'freehand', drawing: drawing.drawing });
    expect(editor.select).toHaveBeenLastCalledWith(inserted.id);
    expect(editor.context.selected.value).toBe(inserted);
    expect(editor.context.drawingMode.value).toBe(true);
  });

  it('applies drawing settings to the latest stroke and retains them for the next stroke', () => {
    const editor = mountEditor();
    editor.context.add('drawing');
    const firstDrawing: DrawnElement = {
      transform: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 45,
        strokeWidth: 12,
      },
    };
    editor.context.addDrawing(firstDrawing);
    const latestId = editor.context.selected.value!.id;
    const fallbackColor = editor.context.drawingSettings.value.color;
    const gradientFill: ColorFill = {
      kind: 'gradient',
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { id: 'start', position: 0, color: '#123456', alpha: 1 },
          { id: 'end', position: 1, color: '#abcdef', alpha: 0.5 },
        ],
      },
    };
    const gradientSettings: DrawingSettings = {
      ...editor.context.drawingSettings.value,
      fill: gradientFill,
      strokeWidth: 24,
      smoothing: 78,
    };

    editor.context.updateDrawingSettings(gradientSettings);

    expect(editor.context.drawingSettings.value).toEqual(gradientSettings);
    expect(editor.update).toHaveBeenNthCalledWith(1, latestId, {
      fill: gradientFill,
      drawing: { ...firstDrawing.drawing, smoothing: 78, strokeWidth: 24 },
    });
    expect(editor.context.selected.value).toMatchObject({
      id: latestId,
      fill: gradientFill,
      fillColor: fallbackColor,
      drawing: { ...firstDrawing.drawing, smoothing: 78, strokeWidth: 24 },
    });

    const solidFill: ColorFill = { kind: 'color', color: '#654321' };
    const solidSettings: DrawingSettings = {
      ...gradientSettings,
      color: solidFill.color,
      fill: solidFill,
      strokeWidth: 16,
      smoothing: 32,
    };
    editor.context.updateDrawingSettings(solidSettings);

    expect(editor.context.drawingSettings.value).toEqual(solidSettings);
    expect(editor.update).toHaveBeenNthCalledWith(2, latestId, {
      fill: solidFill,
      fillColor: solidFill.color,
      drawing: { ...firstDrawing.drawing, smoothing: 32, strokeWidth: 16 },
    });
    expect(editor.context.selected.value).toMatchObject({
      id: latestId,
      fill: solidFill,
      fillColor: solidFill.color,
      drawing: { ...firstDrawing.drawing, smoothing: 32, strokeWidth: 16 },
    });

    const nextDrawing: DrawnElement = {
      transform: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
      drawing: {
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.8 },
        ],
        smoothing: solidSettings.smoothing,
        strokeWidth: solidSettings.strokeWidth,
      },
    };
    editor.context.addDrawing(nextDrawing);
    const nextInserted = editor.insert.mock.calls[1]![0];

    expect(nextInserted).toMatchObject({
      fill: solidFill,
      fillColor: solidFill.color,
      drawing: nextDrawing.drawing,
    });
    expect(editor.context.drawingSettings.value).toEqual(solidSettings);
    expect(editor.context.drawingMode.value).toBe(true);
  });

  it('does not edit an already selected drawing before a new stroke is completed', () => {
    const existing = createClip('existing-drawing', {
      family: 'drawing',
      preset: 'freehand',
      fillColor: '#123456',
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 40,
        strokeWidth: 10,
      },
    });
    const editor = mountEditor({ initialLayers: [existing], selectedId: existing.id });
    editor.context.add('drawing');
    const settings: DrawingSettings = {
      ...editor.context.drawingSettings.value,
      fill: {
        kind: 'gradient',
        gradient: {
          type: 'radial',
          angle: 0,
          stops: [
            { id: 'center', position: 0, color: '#ffffff', alpha: 1 },
            { id: 'edge', position: 1, color: '#000000', alpha: 1 },
          ],
        },
      },
      strokeWidth: 30,
      smoothing: 80,
    };

    editor.context.updateDrawingSettings(settings);

    expect(editor.context.drawingMode.value).toBe(true);
    expect(editor.context.selected.value).toBe(existing);
    expect(editor.context.drawingSettings.value).toEqual(settings);
    expect(editor.update).not.toHaveBeenCalled();
    expect(editor.layers.value[0]).toBe(existing);
    expect(existing).toMatchObject({
      fillColor: '#123456',
      drawing: { smoothing: 40, strokeWidth: 10 },
    });
  });

  it('preserves the configured gradient fill on the inserted drawing ShapeClip', () => {
    const editor = mountEditor();
    const fill = {
      kind: 'gradient' as const,
      gradient: {
        type: 'linear' as const,
        angle: 90,
        stops: [
          { id: 'start', position: 0, color: '#123456', alpha: 0.25 },
          { id: 'end', position: 1, color: '#abcdef', alpha: 0.75 },
        ],
      },
    };
    editor.context.drawingSettings.value.fill = fill;
    const drawing: DrawnElement = {
      transform: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 45,
        strokeWidth: 12,
      },
    };

    editor.context.addDrawing(drawing);

    const inserted = editor.insert.mock.calls[0]![0];
    expect(editor.insert).toHaveBeenCalledOnce();
    expect(inserted).toMatchObject({ family: 'drawing', preset: 'freehand', drawing: drawing.drawing });
    expect(inserted.fill).toEqual(fill);
    expect(inserted.fillColor).toBe(editor.context.drawingSettings.value.color);
  });

  it('keeps text changes in a detached draft until finish and commits the latest bounded value', () => {
    const original = createClip('text-layer', { text: undefined });
    const editor = mountEditor({ initialLayers: [original] });

    expect(editor.context.beginText('text-layer')).toBe(true);
    expect(editor.context.editing.value?.text?.content).toBe('');
    expect(editor.context.editing.value).not.toBe(original);
    expect(editor.context.beginText('text-layer')).toBe(true);
    editor.context.updateText('draft text');

    expect(original.text).toBeUndefined();
    expect(editor.update).not.toHaveBeenCalled();
    editor.context.updateText('x'.repeat(10_005));
    expect(editor.context.editing.value?.text?.content).toHaveLength(10_000);
    editor.context.updateText('final draft');
    editor.context.finishText();
    editor.context.updateText('ignored after finish');

    expect(editor.update).toHaveBeenCalledOnce();
    expect(editor.update).toHaveBeenCalledWith('text-layer', {
      text: expect.objectContaining({ content: 'final draft' }),
    });
    expect(editor.layers.value[0]?.text?.content).toBe('final draft');
    expect(editor.context.editing.value).toBeNull();
  });

  it('keeps text property patches in the active draft until finish commits the complete value', () => {
    const originalText = {
      content: 'Original',
      padding: 6,
      verticalAlign: 'center' as const,
      style: {
        ...createElementText('Original').style,
        fontFamily: 'Original Display',
      },
    };
    const original = createClip('text-layer', { text: originalText });
    const editor = mountEditor({ initialLayers: [original], selectedId: original.id });

    expect(editor.context.beginText(original.id)).toBe(true);
    editor.context.updateText('Draft content');
    editor.context.update({
      text: {
        ...editor.context.editing.value!.text!,
        padding: 18,
        verticalAlign: 'top',
        style: { ...editor.context.editing.value!.text!.style, fontFamily: 'Beam Display', fontSize: 72 },
      },
    });

    expect(editor.update).not.toHaveBeenCalled();
    expect(editor.context.editing.value?.text).toMatchObject({
      content: 'Draft content',
      padding: 18,
      verticalAlign: 'top',
      style: { fontFamily: 'Beam Display', fontSize: 72 },
    });
    expect(editor.layers.value[0]?.text).toEqual(originalText);

    editor.context.finishText();

    expect(editor.update).toHaveBeenCalledOnce();
    expect(editor.update).toHaveBeenCalledWith(original.id, {
      text: expect.objectContaining({
        content: 'Draft content',
        padding: 18,
        verticalAlign: 'top',
        style: expect.objectContaining({ fontFamily: 'Beam Display', fontSize: 72 }),
      }),
    });
    expect(editor.layers.value[0]?.text).toMatchObject({
      content: 'Draft content',
      padding: 18,
      verticalAlign: 'top',
      style: { fontFamily: 'Beam Display', fontSize: 72 },
    });
    expect(editor.context.editing.value).toBeNull();
  });

  it('discards text property patches when the active draft is cancelled', () => {
    const originalText = {
      ...createElementText('Original'),
      style: { ...createElementText('Original').style, fontFamily: 'Original Display' },
    };
    const original = createClip('text-layer', { text: originalText });
    const editor = mountEditor({ initialLayers: [original], selectedId: original.id });

    expect(editor.context.beginText(original.id)).toBe(true);
    editor.context.updateText('Discarded content');
    editor.context.update({
      text: {
        ...editor.context.editing.value!.text!,
        padding: 22,
        verticalAlign: 'bottom',
        style: { ...editor.context.editing.value!.text!.style, fontFamily: 'Discarded Display' },
      },
    });
    editor.context.cancelText();
    editor.context.finishText();

    expect(editor.update).not.toHaveBeenCalled();
    expect(editor.layers.value[0]?.text).toEqual(originalText);
    expect(editor.context.editing.value).toBeNull();
  });

  it('cancels a text draft without changing its source and rejects unavailable targets', () => {
    const original = createClip('plain-layer');
    const editor = mountEditor({ initialLayers: [original] });

    expect(editor.context.beginText('missing')).toBe(false);
    expect(editor.context.beginText('plain-layer')).toBe(true);
    editor.context.updateText('discard this');
    editor.context.cancelText();
    editor.context.finishText();

    expect(editor.update).not.toHaveBeenCalled();
    expect(editor.layers.value[0]?.text).toBeUndefined();
    expect(editor.context.editing.value).toBeNull();
  });

  it('commits the active draft when selection changes or interaction is disabled', async () => {
    const first = createClip('first', { text: undefined });
    const second = createClip('second', { text: undefined });
    const editor = mountEditor({ initialLayers: [first, second], selectedId: 'first' });

    expect(editor.context.beginText('first')).toBe(true);
    editor.context.updateText('committed on selection change');
    editor.selectedId.value = 'second';
    await nextTick();

    expect(editor.update).toHaveBeenCalledWith('first', {
      text: expect.objectContaining({ content: 'committed on selection change' }),
    });
    expect(editor.context.editing.value).toBeNull();
    expect(editor.context.selected.value).toBe(second);

    expect(editor.context.beginText('second')).toBe(true);
    editor.context.updateText('committed on lock');
    editor.canInteract!.value = false;
    await nextTick();

    expect(editor.update).toHaveBeenCalledWith('second', {
      text: expect.objectContaining({ content: 'committed on lock' }),
    });
    expect(editor.context.editing.value).toBeNull();
    expect(editor.context.drawingMode.value).toBe(false);

    editor.canInteract!.value = true;
    await nextTick();
    editor.context.add('drawing');
    expect(editor.context.drawingMode.value).toBe(true);
    editor.canInteract!.value = false;
    await nextTick();
    expect(editor.context.drawingMode.value).toBe(false);
  });

  it('guards insertion, drawing, and text editing when interaction is disabled', () => {
    const original = createClip('existing');
    const editor = mountEditor({ initialLayers: [original], canInteract: false });
    const drawing: DrawnElement = {
      transform: { x: 0, y: 0, width: 1, height: 1 },
      drawing: { points: [{ x: 0, y: 0 }], smoothing: 0, strokeWidth: 1 },
    };

    editor.context.add('shape');
    editor.context.add('drawing');
    editor.context.addDrawing(drawing);

    expect(editor.context.beginText('existing')).toBe(false);
    expect(editor.insert).not.toHaveBeenCalled();
    expect(editor.select).not.toHaveBeenCalled();
    expect(editor.context.drawingMode.value).toBe(false);
    expect(editor.context.editing.value).toBeNull();
  });

  it('supports optional interaction guards and routes edits and removal to the selected layer', () => {
    const original = createClip('selected');
    const editor = mountEditor({ initialLayers: [original], selectedId: 'selected', canInteract: null });

    editor.context.update({ fillColor: '#abcdef' });
    expect(editor.update).toHaveBeenCalledWith('selected', { fillColor: '#abcdef' });
    expect(editor.context.selected.value?.fillColor).toBe('#abcdef');

    editor.context.remove();
    expect(editor.remove).toHaveBeenCalledWith('selected');
    expect(editor.context.selected.value).toBeNull();

    editor.context.update({ fillColor: '#000000' });
    editor.context.remove();
    expect(editor.update).toHaveBeenCalledOnce();
    expect(editor.remove).toHaveBeenCalledOnce();
    editor.context.select('another-layer');
    expect(editor.select).toHaveBeenLastCalledWith('another-layer');
  });
});
