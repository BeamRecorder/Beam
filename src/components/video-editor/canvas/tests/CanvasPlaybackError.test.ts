import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Beamy from '~/components/brand/Beamy/Beamy.vue';
import type { MediaError } from '~/media/shared';
import { emptyComposition } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import { usePlaybackErrorToast } from '../../composables/usePlaybackErrorToast';
import type { PlaybackErrorContext } from '../../composables/playback-error-types';
import CanvasPlaybackError from '../CanvasPlaybackError.vue';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => ({ error: toastError }) }));
const failure: MediaError = { kind: 'decode-failure', sourceId: 'playback', message: 'Error during flush.' };
const writeText = vi.fn();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let wrapper: VueWrapper | undefined;

function mountStatus() {
  const error = ref<MediaError | null>(null);
  const context = reactive<PlaybackErrorContext>({
    project: { id: 'project-1', name: 'Soft Signal' },
    editorData: { sessionId: 'session-1', manifest: { completed: true } },
    composition: emptyComposition(),
  });
  const parentPointer = vi.fn();
  wrapper = mount(
    defineComponent({
      setup() {
        const { t } = useTranslate('VideoEditor');
        usePlaybackErrorToast(error, t, () => context);
        return () =>
          h(
            'div',
            { onPointerdown: parentPointer, onDblclick: parentPointer, onWheel: parentPointer },
            error.value ? [h(CanvasPlaybackError, { error: error.value })] : [],
          );
      },
    }),
    { global: { stubs: { Beamy: true } } },
  );
  return { error, context, parentPointer };
}

beforeEach(() => {
  toastError.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('canvas playback error', () => {
  it('keeps healthy playback free of an error state or toast', () => {
    mountStatus();
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows the sad mascot and a friendly label without exposing the decoder message', async () => {
    const { error } = mountStatus();
    error.value = failure;
    await nextTick();
    expect(wrapper!.getComponent(Beamy).props()).toMatchObject({ phase: 'failed', portrait: true, size: 72 });
    expect(wrapper!.get('[role="alert"]').text()).toContain('Beam could not decode this video.');
    expect(wrapper!.text()).not.toContain(failure.message);
    expect(wrapper!.get('button').text()).toBe('Copy diagnostics');
  });

  it('copies the same complete JSON as the toast and reports success', async () => {
    const { error } = mountStatus();
    error.value = failure;
    await nextTick();
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    const report = writeText.mock.calls[0]![0] as string;
    expect(report).toBe(toastError.mock.calls[0]![2].copyText);
    expect(JSON.parse(report)).toEqual({
      project: { id: 'project-1', name: 'Soft Signal' },
      recordingSession: { id: 'session-1', completed: true },
      media: { id: 'playback', name: null, expectedProjectPath: null },
      error: failure,
    });
    expect(wrapper!.get('button').attributes('data-state')).toBe('copied');
    expect(wrapper!.get('button').text()).toBe('Diagnostics copied');
  });
  it.each([
    [
      { ...failure, context: { operation: 'seek-frame' as const } },
      'Beam could not display this position in the video.',
    ],
    [
      {
        kind: 'unsupported-codec' as const,
        sourceId: 'screen',
        message: 'unsupported',
        track: 'video' as const,
        codec: 'av1',
      },
      'This video format is not supported.',
    ],
    [{ kind: 'missing' as const, sourceId: 'screen', message: 'missing' }, 'The video file is unavailable.'],
    [{ kind: 'invalid-container' as const, sourceId: 'screen', message: 'invalid' }, 'Preview unavailable'],
  ])('explains error %j without exposing technical messages', async (failure, label) => {
    const { error } = mountStatus();
    error.value = failure;
    await nextTick();
    expect(wrapper!.get('p').text()).toBe(label);
  });
  it('keeps the latest source/time in copied diagnostics without repeating the same toast on each seek', async () => {
    const { error } = mountStatus();
    error.value = {
      ...failure,
      context: { operation: 'seek-frame', sourceSeconds: 0, timelineSeconds: 0, codec: 'av01.0.08M.08' },
    };
    await nextTick();
    error.value = {
      ...failure,
      context: { operation: 'seek-frame', sourceSeconds: 2, timelineSeconds: 3, codec: 'av01.0.08M.08' },
    };
    await nextTick();
    expect(toastError).toHaveBeenCalledOnce();
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    expect(JSON.parse(writeText.mock.calls[0]![0] as string).error.context).toMatchObject({
      sourceSeconds: 2,
      timelineSeconds: 3,
    });
  });

  it('keeps the mascot visible and reports a clipboard failure on the button', async () => {
    writeText.mockRejectedValue(new Error('Clipboard denied'));
    const { error } = mountStatus();
    error.value = failure;
    await nextTick();
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    expect(wrapper!.get('button').attributes('data-state')).toBe('error');
    expect(wrapper!.get('button').text()).toBe('Copy failed');
    expect(wrapper!.findComponent(Beamy).exists()).toBe(true);
  });

  it('refreshes the report when the error or project context changes', async () => {
    const { error, context } = mountStatus();
    error.value = failure;
    await nextTick();
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    context.project!.name = 'Renamed project';
    context.editorData!.manifest.completed = false;
    error.value = { ...failure, message: 'New error' };
    await nextTick();
    expect(wrapper!.get('button').attributes('data-state')).toBe('idle');
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    expect(JSON.parse(writeText.mock.calls.at(-1)![0] as string)).toMatchObject({
      project: { name: 'Renamed project' },
      recordingSession: { completed: false },
      error: { message: 'New error' },
    });
  });

  it.each([true, false])('preserves session diagnostics when completion is %s', async (completed) => {
    const { error, context } = mountStatus();
    context.editorData!.manifest.completed = completed;
    context.composition.assets.push({
      id: 'screen',
      kind: 'video',
      name: 'Screen recording',
      fileName: 'segment.mp4',
      durationMs: 1_000,
      width: 1_920,
      height: 1_080,
      src: 'screen.mp4',
      origin: 'session',
      sessionId: 'session-1',
      sessionPath: 'screen/segment.mp4',
    });
    error.value = { ...failure, sourceId: 'screen' };
    await nextTick();
    expect(toastError.mock.calls[0]![0]).toContain('Soft Signal');
    expect(toastError.mock.calls[0]![0].includes('not finalized')).toBe(!completed);
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    expect(JSON.parse(writeText.mock.calls[0]![0] as string)).toMatchObject({
      recordingSession: { completed },
      media: { id: 'screen', expectedProjectPath: 'session-session-1/screen/segment.mp4' },
    });
  });

  it('describes a known asset without a project, recording session or file path', async () => {
    const { error, context } = mountStatus();
    context.project = null;
    context.editorData = null;
    context.composition.assets.push({
      id: 'import',
      kind: 'video',
      name: 'Imported video',
      fileName: null,
      durationMs: 1_000,
      width: null,
      height: null,
      src: 'import.mp4',
      origin: 'project',
    });
    error.value = { ...failure, sourceId: 'import' };
    await nextTick();
    expect(toastError.mock.calls[0]![0]).toContain('Imported video');
    expect(toastError.mock.calls[0]![2].copyText).toContain('"expectedProjectPath": null');
  });

  it('deduplicates repeat toasts while showing the error again until playback recovers', async () => {
    const { error } = mountStatus();
    error.value = failure;
    await nextTick();
    error.value = null;
    await nextTick();
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false);
    error.value = { ...failure };
    await nextTick();
    expect(wrapper!.find('[role="alert"]').exists()).toBe(true);
    expect(toastError).toHaveBeenCalledOnce();
  });

  it('prevents diagnostic interactions from reaching canvas gestures', async () => {
    const { error, parentPointer } = mountStatus();
    error.value = failure;
    await nextTick();
    for (const event of ['pointerdown', 'dblclick', 'wheel']) await wrapper!.get('button').trigger(event);
    expect(parentPointer).not.toHaveBeenCalled();
  });

  it('requires the editor’s diagnostic context rather than fabricating a report', () => {
    expect(() => mount(CanvasPlaybackError, { props: { error: failure } })).toThrow(
      'Playback error diagnostics provider is missing.',
    );
  });

  it.each(SUPPORTED_LOCALES)('translates the error and copy states in %s', async (locale) => {
    await setCurrentLocale(locale);
    const { error } = mountStatus();
    error.value = failure;
    await nextTick();
    expect(wrapper!.text()).not.toMatch(/EditorCanvas\.|EditorOpenError\./);
    expect(wrapper!.get('p').text()).toBeTruthy();
    if (locale !== 'en') expect(wrapper!.get('p').text()).not.toBe('Beam could not decode this video.');
    await wrapper!.get('button').trigger('click');
    await flushPromises();
    if (locale !== 'en') expect(wrapper!.get('button').text()).not.toBe('Diagnostics copied');
  });
});
