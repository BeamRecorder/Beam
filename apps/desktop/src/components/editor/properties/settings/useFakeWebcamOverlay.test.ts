import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import { useFakeWebcamOverlay } from './useFakeWebcamOverlay';
const capture = vi.hoisted(() => ({ importDroppedProjectMedia: vi.fn() }));
const inspect = vi.hoisted(() => ({ inspectDroppedMedia: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('@beam/runtime/shared/dropped-media', () => inspect);
enableAutoUnmount(afterEach);
const media: MediaAsset = {
  id: 'screen-asset',
  kind: 'video',
  name: 'Screen',
  fileName: null,
  src: 'screen.mp4',
  width: 1920,
  height: 1080,
  durationMs: 20000,
  origin: 'session',
  sessionId: 'session',
};
const screen: VisualClip = {
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: media.id,
  trackId: 'screen-track',
  timelineStartMs: 0,
  timelineDurationMs: 20000,
  sourceInMs: 0,
  sourceDurationMs: 20000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
const response = () => ({ ok: true, blob: async () => new Blob(['demo'], { type: 'video/mp4' }) });
const fetchMock = vi.fn();
const create = (patch: Partial<VisualClip> = {}) => {
  const composition = ref(createComposition([media], [{ ...screen, ...patch }]));
  const projectId = ref<string | null>('project'),
    selectedClipId = ref<string | null>('screen');
  const onAdded = vi.fn();
  let action!: ReturnType<typeof useFakeWebcamOverlay>;
  const wrapper = mount(
    defineComponent({
      setup() {
        action = useFakeWebcamOverlay({
          composition,
          projectId: () => projectId.value,
          selectedClipId: () => selectedClipId.value,
          currentTimeMs: () => 0,
          appearance: () => createDefaultClipAppearance('webcam'),
          onAdded,
        });
        return () => null;
      },
    }),
  );
  return { action, composition, projectId, wrapper, onAdded };
};
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(response());
  inspect.inspectDroppedMedia
    .mockReset()
    .mockResolvedValue({ kind: 'video', durationMs: 8000, width: 640, height: 360 });
  capture.importDroppedProjectMedia
    .mockReset()
    .mockResolvedValue({ ...media, id: 'import', origin: 'project', durationMs: 0, sessionId: undefined });
});
afterEach(() => vi.unstubAllGlobals());

describe('developer demo webcam import', () => {
  it('loads only on demand, copies the fixture into the project and commits one complete linked camera lane', async () => {
    const { action, composition, onAdded } = create();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(action.unavailable.value).toBe('');
    await action.add();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/dev-media\/demo-webcam.mp4$/);
    expect(capture.importDroppedProjectMedia).toHaveBeenCalledWith('project', expect.any(File), 'video');
    expect(capture.importDroppedProjectMedia.mock.calls[0]?.[1]).toMatchObject({
      name: 'demo-webcam.mp4',
      type: 'video/mp4',
    });
    const cameras = composition.value.clips.filter((clip) => clip.kind === 'webcam');
    expect(cameras).toHaveLength(3);
    expect(cameras.every((clip) => clip.recordingClipId === 'screen')).toBe(true);
    expect(composition.value.assets.at(-1)).toMatchObject({
      durationMs: 8000,
      width: 640,
      height: 360,
      sessionId: 'session',
    });
    expect(onAdded).toHaveBeenCalledOnce();
    expect(action.busy.value).toBe(false);
    expect(action.unavailable.value).toBe('This recording already has a webcam.');
    await action.add();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('blocks repeated submissions while the source is loading', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { action, onAdded } = create();
    const pending = action.add();
    expect(action.busy.value).toBe(true);
    await action.add();
    expect(fetchMock).toHaveBeenCalledOnce();
    resolve(response());
    await pending;
    expect(onAdded).toHaveBeenCalledOnce();
  });
  it('requires an unlocked, enabled recording and a project', async () => {
    const { action, projectId, composition } = create({ locked: true });
    expect(action.unavailable.value).toBe('Unlock the screen recording first.');
    await action.add();
    composition.value = createComposition([media], [{ ...screen, enabled: false }]);
    expect(action.unavailable.value).toBe('Add a screen recording first.');
    projectId.value = null;
    await action.add();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['network', 'http', 'inspection', 'import'])(
    'reports %s errors without changing the composition and permits retry',
    async (failure) => {
      if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
      if (failure === 'http') fetchMock.mockResolvedValueOnce({ ok: false });
      if (failure === 'inspection') inspect.inspectDroppedMedia.mockRejectedValueOnce(new Error('invalid'));
      if (failure === 'import') capture.importDroppedProjectMedia.mockRejectedValueOnce(new Error('disk full'));
      const { action, composition, onAdded } = create();
      const before = composition.value;
      await action.add();
      expect(composition.value).toBe(before);
      expect(action.error.value).toBe('Could not add the demo webcam.');
      expect(action.busy.value).toBe(false);
      expect(onAdded).not.toHaveBeenCalled();
      await action.add();
      expect(action.error.value).toBe('');
      expect(onAdded).toHaveBeenCalledOnce();
    },
  );
  it.each(['project', 'unmount', 'removed'])(
    'ignores an import if the host changes during loading: %s',
    async (change) => {
      let resolve!: (value: ReturnType<typeof response>) => void;
      fetchMock.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const { action, projectId, wrapper, composition, onAdded } = create();
      const pending = action.add();
      const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
      if (change === 'project') projectId.value = 'other-project';
      if (change === 'unmount') wrapper.unmount();
      if (change === 'removed') composition.value = createComposition();
      resolve(response());
      await pending;
      expect(onAdded).not.toHaveBeenCalled();
      expect(composition.value.clips.every((clip) => clip.kind !== 'webcam')).toBe(true);
      if (change === 'unmount') {
        expect(signal.aborted).toBe(true);
        expect(action.error.value).toBe('');
        await action.add();
        expect(fetchMock).toHaveBeenCalledOnce();
      }
    },
  );
  it('does not publish a late native import into another project', async () => {
    let resolve!: (value: MediaAsset) => void;
    capture.importDroppedProjectMedia.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { action, projectId, onAdded } = create();
    const pending = action.add();
    await vi.waitFor(() => expect(capture.importDroppedProjectMedia).toHaveBeenCalledOnce());
    projectId.value = 'other';
    resolve(media);
    await pending;
    expect(onAdded).not.toHaveBeenCalled();
  });
});
