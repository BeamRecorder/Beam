import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
const capture = vi.hoisted(() => ({
  openEditor: vi.fn(),
  openScreenshot: vi.fn(),
  cancelEditorOpening: vi.fn(),
  hideTeleprompter: vi.fn(),
  setCameraOverlayActive: vi.fn(),
  showHud: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
import { useEditorOpening } from './useEditorOpening';
const project = { id: 'project', mode: 'studio' } as CaptureProject;
const setup = () => {
  let api!: ReturnType<typeof useEditorOpening>;
  const wrapper = mount(
    defineComponent({
      setup: () => ((api = useEditorOpening()), {}),
      template: '<div />',
    }),
  );
  return { api, wrapper };
};
beforeEach(() => {
  vi.resetAllMocks();
  capture.openEditor.mockResolvedValue(true);
  capture.openScreenshot.mockResolvedValue(true);
  capture.cancelEditorOpening.mockResolvedValue(true);
});
describe('editor opening ownership', () => {
  it.each([false, true])(
    'does not interrupt a new attempt when an older cancellation finishes (failure: %s)',
    async (failure) => {
      const { api, wrapper } = setup();
      let finish!: (value: boolean) => void;
      let reject!: (cause: Error) => void;
      capture.cancelEditorOpening.mockReturnValueOnce(
        new Promise<boolean>((resolve, fail) => {
          finish = resolve;
          reject = fail;
        }),
      );
      api.begin();
      const cancelling = api.cancel();
      api.begin();
      if (failure) reject(new Error('old cancellation'));
      else finish(true);
      await cancelling;
      expect(api.preparing.value).toBe(true);
      expect(capture.showHud).not.toHaveBeenCalled();
      expect(capture.setCameraOverlayActive).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );
  it('begins with a real initial stage and opens the requested disposition', async () => {
    const { api, wrapper } = setup();
    const attempt = api.begin();
    expect(api.preparing.value).toBe(true);
    expect(api.progress.value).toEqual({ stage: 'openingWindow', value: 10 });
    expect(await api.open(project, { disposition: 'new-window' }, attempt)).toBe(true);
    expect(capture.openEditor).toHaveBeenCalledWith(project.id, {
      disposition: 'new-window',
    });
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
    expect(capture.setCameraOverlayActive).toHaveBeenCalledWith(false);
    expect(api.project.value).toBe(project);
    expect(api.preparing.value).toBe(false);
    wrapper.unmount();
  });
  it('opens screenshot projects through their own route', async () => {
    const { api, wrapper } = setup();
    expect(await api.open({ ...project, mode: 'screenshot' }, {}, api.begin())).toBe(true);
    expect(capture.openScreenshot).toHaveBeenCalledWith(project.id);
    expect(capture.openEditor).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('cancels during project resolution before any native editor exists', async () => {
    const { api, wrapper } = setup();
    const attempt = api.begin();
    capture.cancelEditorOpening.mockResolvedValue(false);
    expect(await api.cancel()).toBe(false);
    expect(await api.open(project, {}, attempt)).toBe(false);
    expect(capture.openEditor).not.toHaveBeenCalled();
    expect(capture.showHud).toHaveBeenCalledOnce();
    expect(capture.setCameraOverlayActive).toHaveBeenLastCalledWith(true);
    wrapper.unmount();
  });
  it('ignores a late open completion and preserves the next attempt', async () => {
    const { api, wrapper } = setup();
    let finish!: (value: boolean) => void;
    capture.openEditor.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = api.begin();
    const opening = api.open(project, {}, first);
    await api.cancel();
    const second = api.begin();
    finish(true);
    expect(await opening).toBe(false);
    expect(api.isCurrent(first)).toBe(false);
    expect(api.isCurrent(second)).toBe(true);
    expect(api.preparing.value).toBe(true);
    expect(api.project.value).toBe(project);
    wrapper.unmount();
  });
  it('ignores cancellation while idle and after a successful open', async () => {
    const { api, wrapper } = setup();
    expect(await api.cancel()).toBe(false);
    await api.open(project, {}, api.begin());
    expect(await api.cancel()).toBe(false);
    expect(capture.cancelEditorOpening).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('returns to the HUD even if native cancellation rejects', async () => {
    const { api, wrapper } = setup();
    const attempt = api.begin();
    capture.cancelEditorOpening.mockRejectedValueOnce(new Error('unavailable'));
    await expect(api.cancel()).rejects.toThrow('unavailable');
    expect(api.isCurrent(attempt)).toBe(false);
    expect(api.preparing.value).toBe(false);
    expect(capture.showHud).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('keeps native open failures available to the error screen', async () => {
    const { api, wrapper } = setup();
    capture.openEditor.mockRejectedValueOnce(new Error('decode failed'));
    await expect(api.open(project, {}, api.begin())).rejects.toThrow('decode failed');
    expect(api.project.value).toBe(project);
    wrapper.unmount();
  });
  it('invalidates lookups and opening promises when unmounted', async () => {
    const { api, wrapper } = setup();
    const attempt = api.begin();
    wrapper.unmount();
    expect(api.isCurrent(attempt)).toBe(false);
    expect(await api.open(project, {}, attempt)).toBe(false);
    expect(capture.openEditor).not.toHaveBeenCalled();
  });
  it('settles a natively cancelled opening without treating it as an error', async () => {
    const { api, wrapper } = setup();
    capture.openEditor.mockResolvedValue(false);
    expect(await api.open(project, {}, api.begin())).toBe(false);
    expect(api.preparing.value).toBe(false);
    wrapper.unmount();
  });
});
