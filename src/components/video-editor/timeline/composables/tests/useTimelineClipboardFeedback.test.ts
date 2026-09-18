import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import type { Clip } from '~/media/shared/composition-types';
import type { TimelineClipboardItem } from '../timeline-clipboard-types';
import { resetInternalEditorClipboardSync } from '../../../composables/internal-editor-clipboard';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));

const { useTimelineClipboardFeedback } = await import('../useTimelineClipboardFeedback');

const item = (
  descriptor: Extract<TimelineClipboardItem['descriptor'], { kind: 'item' | 'caption' }>,
): TimelineClipboardItem => ({
  type: 'clip',
  scopeId: 'project-a',
  category: 'visual',
  clip: {} as Clip,
  asset: null,
  descriptor,
});

describe('useTimelineClipboardFeedback', () => {
  let wrapper: VueWrapper | undefined;
  let feedback!: ReturnType<typeof useTimelineClipboardFeedback>;

  beforeEach(() => {
    setCurrentLocale('en');
    vi.useFakeTimers();
    vi.clearAllMocks();
    const Harness = defineComponent({
      setup() {
        feedback = useTimelineClipboardFeedback();
        return () => h('div');
      },
    });
    wrapper = mount(Harness);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
    setCurrentLocale('en');
    resetInternalEditorClipboardSync();
  });

  it('includes the source item name in copy and paste success toasts', () => {
    const source = item({ kind: 'item', name: 'screen-recording.mp4' });

    feedback.reportCopySuccess(source);
    expect(toast.success).toHaveBeenCalledWith(
      'Copied: screen-recording.mp4',
      2_400,
      undefined,
      expect.objectContaining({
        leadingIcon: 'copy',
        preview: expect.objectContaining({ kind: 'image', alt: expect.any(String) }),
      }),
    );

    feedback.reportPasteSuccess({ type: 'clip', id: 'pasted-clip' }, source);
    expect(toast.success).toHaveBeenLastCalledWith(
      'Pasted: screen-recording.mp4',
      2_400,
      undefined,
      expect.objectContaining({ leadingIcon: 'paste', preview: expect.any(Object) }),
    );
    expect(feedback.recentPaste.value).toEqual({ type: 'clip', id: 'pasted-clip', timestamp: expect.any(Number) });
  });

  it('formats caption and zoom descriptors in detailed feedback', () => {
    feedback.reportCopySuccess(item({ kind: 'caption', text: 'Hello timeline' }));
    expect(toast.success).toHaveBeenLastCalledWith(
      'Copied: Caption “Hello timeline”',
      2_400,
      undefined,
      expect.objectContaining({ leadingIcon: 'copy', preview: expect.any(Object) }),
    );

    feedback.reportPasteSuccess(
      { type: 'zoom', id: 'pasted-zoom' },
      {
        type: 'zoom',
        scopeId: 'project-a',
        category: 'zoom',
        zoom: {} as never,
        descriptor: { kind: 'zoom', number: 2 },
      },
    );
    expect(toast.success).toHaveBeenLastCalledWith(
      'Pasted: Zoom 2',
      2_400,
      undefined,
      expect.objectContaining({ leadingIcon: 'paste', preview: expect.any(Object) }),
    );
  });

  it('lists every copied and pasted item name in a multi-item bundle toast', () => {
    const bundle: TimelineClipboardItem = {
      type: 'selection',
      scopeId: 'project-a',
      entries: [
        {
          type: 'clip',
          category: 'visual',
          clip: {} as Clip,
          asset: null,
          descriptor: { kind: 'item', name: 'screen.mp4' },
        },
        {
          type: 'clip',
          category: 'caption',
          clip: {} as Clip,
          asset: null,
          descriptor: { kind: 'caption', text: 'Hello timeline' },
        },
        {
          type: 'zoom',
          category: 'zoom',
          zoom: {} as never,
          descriptor: { kind: 'zoom', number: 2 },
        },
      ],
      anchorTimeMs: 0,
      primaryIndex: 0,
      descriptor: {
        kind: 'selection',
        items: [
          { kind: 'item', name: 'screen.mp4' },
          { kind: 'caption', text: 'Hello timeline' },
          { kind: 'zoom', number: 2 },
        ],
      },
    };

    feedback.reportCopySuccess(bundle);
    expect(toast.success).toHaveBeenLastCalledWith(
      'Copied: screen.mp4, Caption “Hello timeline”, Zoom 2',
      2_400,
      undefined,
      expect.objectContaining({
        leadingIcon: 'copy',
        preview: expect.objectContaining({ count: 3 }),
      }),
    );

    feedback.reportPasteSuccess({ type: 'clip', id: 'pasted-screen' }, bundle);
    expect(toast.success).toHaveBeenLastCalledWith(
      'Pasted: screen.mp4, Caption “Hello timeline”, Zoom 2',
      2_400,
      undefined,
      expect.objectContaining({
        leadingIcon: 'paste',
        preview: expect.objectContaining({ count: 3 }),
      }),
    );
    expect(feedback.recentPaste.value).toEqual({
      type: 'clip',
      id: 'pasted-screen',
      timestamp: expect.any(Number),
    });
  });

  it('reports paste failures with the original error detail and expires highlights', () => {
    feedback.reportPasteError('The copied item does not fit at the playhead.');
    expect(toast.error).toHaveBeenCalledWith('Unable to paste: The copied item does not fit at the playhead.', 5_000);

    feedback.reportPasteSuccess({ type: 'clip', id: 'pasted-clip' }, item({ kind: 'item', name: 'clip.mp4' }));
    vi.advanceTimersByTime(899);
    expect(feedback.recentPaste.value).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(feedback.recentPaste.value).toBeNull();
  });
});
