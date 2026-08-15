import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaInputError, type DroppedMediaInspection, type MediaAsset } from '~/media/shared';
import { useEditorMediaDrop } from '../useEditorMediaDrop';

const mocks = vi.hoisted(() => ({
  inspectDroppedMedia: vi.fn(),
  capture: { importDroppedProjectMedia: vi.fn() },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    addToast: vi.fn(),
  },
}));

vi.mock('~/media/shared', async () => {
  const actual = await vi.importActual<typeof import('~/media/shared')>('~/media/shared');
  return { ...actual, inspectDroppedMedia: mocks.inspectDroppedMedia };
});
vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => mocks.toast }));

const file = (name: string, type = 'video/mp4') => new File(['media'], name, { type });

const inspection = (kind: DroppedMediaInspection['kind'] = 'video', overrides = {}): DroppedMediaInspection => ({
  kind,
  durationMs: 2_500,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  hasAudio: kind === 'video',
  canDecodeAudio: kind !== 'video',
  audioCodec: kind === 'video' ? 'opus' : null,
  ...overrides,
});

const asset = (name: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id: `asset-${name}`,
  kind,
  name,
  fileName: name,
  durationMs: 2_500,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `project-media://${name}`,
  origin: 'project',
});

const event = (types: string[], files: File[] = []) =>
  ({
    dataTransfer: { types, files, dropEffect: 'none' },
    preventDefault: vi.fn(),
  }) as unknown as DragEvent;

let wrapper: VueWrapper | undefined;

const mountDrop = (currentTimeSeconds = 7.25) => {
  let state!: ReturnType<typeof useEditorMediaDrop>;
  const addImportedAsset = vi.fn().mockReturnValue('clip-id');
  const Harness = defineComponent({
    setup() {
      state = useEditorMediaDrop({
        projectId: () => 'project-1',
        currentTimeSeconds: () => currentTimeSeconds,
        addImportedAsset,
        t: (key, params) => `${key}:${JSON.stringify(params ?? {})}`,
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return { state, addImportedAsset };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inspectDroppedMedia.mockImplementation(async (dropped: File) =>
    inspection(dropped.name.endsWith('.mp3') ? 'audio' : 'video'),
  );
  mocks.capture.importDroppedProjectMedia.mockImplementation(
    async (_projectId: string, dropped: File, kind: MediaAsset['kind']) => asset(dropped.name, kind),
  );
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe('useEditorMediaDrop', () => {
  it('reports GIF rejection explicitly and never imports the file', async () => {
    const { state } = mountDrop();
    mocks.inspectDroppedMedia.mockRejectedValueOnce(new Error('GIF not supported'));

    await state.importFiles([file('animation.gif', 'image/gif')]);

    expect(mocks.capture.importDroppedProjectMedia).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('GIF not supported'), 6_000);
  });

  it('accepts Files drops only and keeps the overlay active across nested drag depth', () => {
    const { state } = mountDrop();
    const nonFileEnter = event(['text/plain']);
    state.onMediaDragEnter(nonFileEnter);
    expect(nonFileEnter.preventDefault).not.toHaveBeenCalled();
    expect(state.isDraggingMedia.value).toBe(false);

    const firstEnter = event(['Files']);
    const nestedEnter = event(['Files']);
    state.onMediaDragEnter(firstEnter);
    state.onMediaDragEnter(nestedEnter);
    expect(firstEnter.preventDefault).toHaveBeenCalledOnce();
    expect(nestedEnter.preventDefault).toHaveBeenCalledOnce();
    expect(state.isDraggingMedia.value).toBe(true);

    state.onMediaDragLeave(event(['Files']));
    expect(state.isDraggingMedia.value).toBe(true);
    state.onMediaDragLeave(event(['Files']));
    expect(state.isDraggingMedia.value).toBe(false);
  });

  it('imports a batch at one frozen playhead, in reverse add order, with a success toast', async () => {
    const { state, addImportedAsset } = mountDrop(7.25);
    const files = [file('one.mp4'), file('two.png', 'image/png'), file('three.mp3', 'audio/mpeg')];
    mocks.inspectDroppedMedia
      .mockResolvedValueOnce(inspection('video'))
      .mockResolvedValueOnce(inspection('image'))
      .mockResolvedValueOnce(inspection('audio'));
    mocks.capture.importDroppedProjectMedia
      .mockResolvedValueOnce(asset('one.mp4', 'video'))
      .mockResolvedValueOnce(asset('two.png', 'image'))
      .mockResolvedValueOnce(asset('three.mp3', 'audio'));

    await state.importFiles(files);

    expect(mocks.capture.importDroppedProjectMedia).toHaveBeenCalledTimes(3);
    expect(addImportedAsset.mock.calls.map(([imported]) => imported.id)).toEqual([
      'asset-three.mp3',
      'asset-two.png',
      'asset-one.mp4',
    ]);
    expect(addImportedAsset.mock.calls.every(([, , startMs]) => startMs === 7_250)).toBe(true);
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining('mediaDropBatchSuccess'));
  });

  it('keeps valid files from a partially rejected batch and reports the rejected file', async () => {
    const { state, addImportedAsset } = mountDrop(2);
    const accepted = file('accepted.mp4');
    const rejected = file('broken.mp4');
    mocks.inspectDroppedMedia.mockResolvedValueOnce(inspection('video')).mockRejectedValueOnce(
      new MediaInputError({
        kind: 'unsupported-codec',
        sourceId: rejected.name,
        track: 'video',
        codec: 'av1',
        message: 'bad codec',
      }),
    );
    mocks.capture.importDroppedProjectMedia.mockResolvedValueOnce(asset(accepted.name));

    await state.importFiles([accepted, rejected]);

    expect(addImportedAsset).toHaveBeenCalledTimes(1);
    expect(addImportedAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset-accepted.mp4' }),
      expect.anything(),
      2_000,
    );
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining('mediaDropSingleSuccess'));
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('mediaDropRejected'), 6_000);
  });

  it('shows the audio warning when a video imports without decodable audio', async () => {
    const { state } = mountDrop();
    mocks.inspectDroppedMedia.mockResolvedValue(inspection('video', { hasAudio: true, canDecodeAudio: false }));
    await state.importFiles([file('silent-audio.mp4')]);

    expect(mocks.toast.success).toHaveBeenCalledOnce();
    expect(mocks.toast.addToast).toHaveBeenCalledWith(
      expect.stringContaining('mediaDropAudioIgnored'),
      'warning',
      5_000,
    );
  });

  it('rejects a concurrent import while the first batch is still validating', async () => {
    const { state } = mountDrop();
    let resolveInspection!: (value: DroppedMediaInspection) => void;
    const pending = new Promise<DroppedMediaInspection>((resolve) => {
      resolveInspection = resolve;
    });
    mocks.inspectDroppedMedia.mockReturnValueOnce(pending);

    const firstImport = state.importFiles([file('first.mp4')]);
    expect(state.isImportingMedia.value).toBe(true);
    await state.importFiles([file('second.mp4')]);
    expect(mocks.toast.info).toHaveBeenCalledWith(expect.stringContaining('mediaDropAlreadyImporting'));
    expect(mocks.capture.importDroppedProjectMedia).not.toHaveBeenCalled();

    resolveInspection(inspection('video'));
    await firstImport;
    await flushPromises();
    expect(state.isImportingMedia.value).toBe(false);
    expect(mocks.capture.importDroppedProjectMedia).toHaveBeenCalledOnce();
  });
});
