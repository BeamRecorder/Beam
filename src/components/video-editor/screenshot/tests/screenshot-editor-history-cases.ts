import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotEditorTestHarness } from './screenshot-editor-test-helpers';
import { documentFixture } from './screenshot-editor-test-helpers';

type EditorCaptureMocks = {
  getScreenshot: Mock;
  saveScreenshot: Mock;
  listCursorPacks: Mock;
};

export function registerScreenshotEditorHistoryAndFooterTests(
  capture: EditorCaptureMocks,
  harness: ScreenshotEditorTestHarness,
) {
  const { mountEditor, clickText, ScreenshotCanvasStub, ScreenshotCompositionStub } = harness;
  const canvasState = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findComponent(ScreenshotCanvasStub).props('state') as ScreenshotState;
  const canvas = (wrapper: ReturnType<typeof mount>) => wrapper.findComponent(ScreenshotCanvasStub);
  const deleteButton = (wrapper: ReturnType<typeof mount>) => wrapper.get('.properties-footer').get('button');

  it('deletes the selected shape from its named footer action and disables it when locked', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'footer-shape' });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Arrow');

    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    composition.vm.$emit('update', 'footer-shape', { locked: true });
    await wrapper.vm.$nextTick();
    const action = deleteButton(wrapper);
    expect(action.text()).toContain('Arrow');
    expect((action.element as HTMLButtonElement).disabled).toBe(true);
    expect(canvasState(wrapper).shapes).toHaveLength(1);

    composition.vm.$emit('update', 'footer-shape', { locked: false });
    await wrapper.vm.$nextTick();
    await action.trigger('click');
    expect(canvasState(wrapper).shapes).toEqual([]);
    expect(wrapper.find('.properties-footer').exists()).toBe(false);
    expect(wrapper.findComponent(ScreenshotCompositionStub).props('selectedId')).toBeNull();
    wrapper.unmount();
  });

  it('deletes the selected cursor from the named footer action and disables it when locked', async () => {
    const cursorPack: CursorPackDescriptor = {
      id: 'pack:footer',
      name: 'Footer cursor pack',
      source: 'imported',
      colorMode: 'tintable',
      defaultCursorId: 'pointer',
      cursors: [
        {
          id: 'pointer',
          label: 'Pointer',
          url: 'project-media://cursor/footer/pointer.svg',
          format: 'svg',
          tintable: true,
          intrinsicSize: { width: 32, height: 32 },
          nominalSize: 32,
          hotspot: { x: 8, y: 4 },
        },
      ],
      automaticMap: { default: 'pointer' },
    };
    capture.listCursorPacks.mockResolvedValueOnce([cursorPack]);
    vi.stubGlobal('crypto', { randomUUID: () => 'footer-cursor' });
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[aria-label="Elements"]').trigger('click');
    await clickText(wrapper, 'Cursor');

    const composition = wrapper.findComponent(ScreenshotCompositionStub);
    composition.vm.$emit('update', 'footer-cursor', { locked: true });
    await wrapper.vm.$nextTick();
    const action = deleteButton(wrapper);
    expect(action.text()).toContain('Cursor');
    expect((action.element as HTMLButtonElement).disabled).toBe(true);
    expect(canvasState(wrapper).cursors).toHaveLength(1);

    composition.vm.$emit('update', 'footer-cursor', { locked: false });
    await wrapper.vm.$nextTick();
    await action.trigger('click');
    expect(canvasState(wrapper).cursors).toEqual([]);
    expect(wrapper.find('.properties-footer').exists()).toBe(false);
    expect(wrapper.findComponent(ScreenshotCompositionStub).props('selectedId')).toBeNull();
    wrapper.unmount();
  });

  it('persists screenshot history on unmount and reopens it for undo and redo', async () => {
    const persisted = { document: documentFixture() };
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    capture.getScreenshot.mockImplementation(async () => structuredClone(persisted.document));
    capture.saveScreenshot.mockImplementation(
      async (_id: string, state: ScreenshotState, history: ScreenshotDocument['history']) => {
        persisted.document = {
          ...persisted.document,
          state: clone(state),
          history: clone(history),
        };
      },
    );
    vi.stubGlobal('crypto', { randomUUID: () => 'history-shape' });
    const first = mountEditor();
    await flushPromises();
    await first.get('[aria-label="Elements"]').trigger('click');
    await clickText(first, 'Arrow');
    const initialFill = canvasState(first).shapes[0]!.fillColor;
    await first.get('[data-testid="change-shape-style"]').trigger('click');
    await first.vm.$nextTick();

    await clickText(first, 'Export');
    await first.get('[aria-label="Size preset"]').setValue('1:1');
    await first.vm.$nextTick();
    await first.get('[aria-label="Image"]').trigger('click');
    await clickText(first, 'Crop');
    const crop = { x: 0.2, y: 0.1, width: 0.6, height: 0.7 };
    canvas(first).vm.$emit('crop', crop);
    await first.vm.$nextTick();

    await clickText(first, 'Copy');
    await flushPromises();
    const firstSave = capture.saveScreenshot.mock.calls.at(-1) as [
      string,
      ScreenshotState,
      NonNullable<ScreenshotDocument['history']>,
    ];
    expect(firstSave).toHaveLength(3);
    expect(firstSave[2]).toMatchObject({
      version: 1,
      undo: expect.any(Array),
      redo: [],
    });
    expect(firstSave[2].undo.at(-1)).toEqual(firstSave[1]);
    expect(firstSave[1]).toMatchObject({
      shapes: [expect.objectContaining({ id: 'history-shape', fillColor: '#123456' })],
      canvas: { width: 1080, height: 1080 },
      image: { crop },
    });

    first.unmount();
    await flushPromises();
    const savedDocument = structuredClone(persisted.document);
    expect(savedDocument.state).toEqual(firstSave[1]);
    expect(savedDocument.history).toEqual(firstSave[2]);

    const reopened = mountEditor();
    await flushPromises();
    const undo = reopened.get('[aria-label="Undo (Ctrl+Z)"]');
    const redo = reopened.get('[aria-label="Redo (Ctrl+Y)"]');
    expect((undo.element as HTMLButtonElement).disabled).toBe(false);
    expect((redo.element as HTMLButtonElement).disabled).toBe(true);
    const undoOnce = async () => {
      await undo.trigger('click');
      await flushPromises();
    };
    const redoOnce = async () => {
      await redo.trigger('click');
      await flushPromises();
    };

    await undoOnce();
    expect(canvasState(reopened).image.crop).toBeUndefined();
    await undoOnce();
    expect(canvasState(reopened).canvas).toMatchObject({
      width: 1200,
      height: 800,
    });
    await undoOnce();
    expect(canvasState(reopened).shapes[0]?.fillColor).toBe(initialFill);
    await undoOnce();
    expect(canvasState(reopened).shapes).toEqual([]);
    expect((redo.element as HTMLButtonElement).disabled).toBe(false);

    await redoOnce();
    expect(canvasState(reopened).shapes).toHaveLength(1);
    await redoOnce();
    expect(canvasState(reopened).shapes[0]?.fillColor).toBe('#123456');
    await redoOnce();
    expect(canvasState(reopened).canvas).toMatchObject({
      width: 1080,
      height: 1080,
    });
    await redoOnce();
    expect(canvasState(reopened).image.crop).toEqual(crop);
    reopened.unmount();
  });
}
