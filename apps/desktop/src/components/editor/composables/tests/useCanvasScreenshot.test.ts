import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
import { canvasScreenshotName, useCanvasScreenshot } from '../useCanvasScreenshot';

const mocks = vi.hoisted(() => ({
  createScreenshotFromCanvas: vi.fn(),
  openScreenshot: vi.fn(),
  playScreenshotSound: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: mocks }));
vi.mock('~/utils/screenshot-sound', () => ({ playScreenshotSound: mocks.playScreenshotSound }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => mocks }));

describe('canvas screenshot confirmation', () => {
  let wrapper: VueWrapper;
  const captureCurrentFrame = vi.fn();
  const screenshot = { id: 'still-1', name: 'Screenshot', source: 'project-media://screenshot/still-1/source.png' };

  const setup = (hasSource = true, hasProject = true) => {
    let api!: ReturnType<typeof useCanvasScreenshot>;
    wrapper = mount(
      defineComponent({
        setup() {
          api = useCanvasScreenshot({
            source: shallowRef(hasSource ? { captureCurrentFrame } : null),
            project: () => (hasProject ? ({ name: 'Project' } as CaptureProject) : null),
          });
          return () => null;
        },
      }),
    );
    return api;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    captureCurrentFrame.mockResolvedValue({ bytes: new ArrayBuffer(4), width: 1920, height: 1080 });
    mocks.createScreenshotFromCanvas.mockResolvedValue(screenshot);
  });
  afterEach(() => wrapper?.unmount());

  it('confirms only after the screenshot is saved and shows the success toast before playing', async () => {
    const api = setup();
    await api.takeCanvasScreenshot();
    expect(mocks.playScreenshotSound).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotSound.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.success.mock.invocationCallOrder[0]!,
    );
    expect(mocks.success).toHaveBeenCalledWith('Screenshot created', 3_000, expect.any(Object), {
      preview: { kind: 'image', src: screenshot.source, alt: screenshot.name },
    });
    await mocks.success.mock.calls[0]![2].onClick();
    expect(mocks.openScreenshot).toHaveBeenCalledExactlyOnceWith('still-1', { disposition: 'new-window' });
    expect(api.isCapturingScreenshot.value).toBe(false);
  });

  it.each([
    [false, true],
    [true, false],
  ])('does not confirm without a source or project (%s, %s)', async (source, project) => {
    await setup(source, project).takeCanvasScreenshot();
    expect(captureCurrentFrame).not.toHaveBeenCalled();
    expect(mocks.playScreenshotSound).not.toHaveBeenCalled();
  });

  it('does not duplicate capture or confirmation while a screenshot is pending', async () => {
    let finish!: () => void;
    mocks.playScreenshotSound.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const api = setup();
    const pending = api.takeCanvasScreenshot();
    await vi.waitFor(() => expect(mocks.playScreenshotSound).toHaveBeenCalledOnce());
    await api.takeCanvasScreenshot();
    expect(captureCurrentFrame).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotSound).toHaveBeenCalledOnce();
    finish();
    await pending;
    expect(api.isCapturingScreenshot.value).toBe(false);
  });

  it.each(['frame', 'save'])('does not confirm a screenshot when %s fails', async (stage) => {
    if (stage === 'frame') captureCurrentFrame.mockRejectedValueOnce(new Error('Frame failed'));
    else mocks.createScreenshotFromCanvas.mockRejectedValueOnce('Save failed');
    const api = setup();
    await api.takeCanvasScreenshot();
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotSound).not.toHaveBeenCalled();
    expect(api.isCapturingScreenshot.value).toBe(false);
  });

  it.each([new Error('Editor failed'), 'Editor failed'])(
    'reports a later editor failure without replaying the sound (%s)',
    async (reason) => {
      await setup().takeCanvasScreenshot();
      mocks.openScreenshot.mockRejectedValueOnce(reason);
      await expect(mocks.success.mock.calls[0]![2].onClick()).rejects.toBe(reason);
      expect(mocks.error).toHaveBeenCalledOnce();
      expect(mocks.playScreenshotSound).toHaveBeenCalledOnce();
    },
  );

  it.each(['en', 'fr', 'ja'])('names screenshots using the %s locale', (locale) => {
    const date = new Date('2026-10-11T10:00:00Z');
    expect(canvasScreenshotName('Project', date, locale)).toBe(
      `Project — ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date)}`,
    );
  });
});
