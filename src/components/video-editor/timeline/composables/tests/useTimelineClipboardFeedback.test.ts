import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import type { Clip } from '~/media/shared/composition-types';
import type { TimelineClipboardItem } from '../timeline-clipboard-types';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));

const { useTimelineClipboardFeedback } = await import('../useTimelineClipboardFeedback');

const item = (descriptor: Exclude<TimelineClipboardItem['descriptor'], { kind: 'zoom' }>): TimelineClipboardItem => ({
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
  });

  it('includes the source item name in copy and paste success toasts', () => {
    const source = item({ kind: 'item', name: 'screen-recording.mp4' });

    feedback.reportCopySuccess(source);
    expect(toast.success).toHaveBeenCalledWith('Copied: screen-recording.mp4', 1_500, undefined, {
      leadingIcon: 'copy',
    });

    feedback.reportPasteSuccess('pasted-clip', source);
    expect(toast.success).toHaveBeenLastCalledWith('Pasted: screen-recording.mp4', 1_500, undefined, {
      leadingIcon: 'paste',
    });
    expect(feedback.recentPaste.value).toEqual({ type: 'clip', id: 'pasted-clip', timestamp: expect.any(Number) });
  });

  it('formats caption and zoom descriptors in detailed feedback', () => {
    feedback.reportCopySuccess(item({ kind: 'caption', text: 'Hello timeline' }));
    expect(toast.success).toHaveBeenLastCalledWith('Copied: Caption “Hello timeline”', 1_500, undefined, {
      leadingIcon: 'copy',
    });

    feedback.reportPasteSuccess('pasted-zoom', {
      type: 'zoom',
      scopeId: 'project-a',
      category: 'zoom',
      zoom: {} as never,
      descriptor: { kind: 'zoom', number: 2 },
    });
    expect(toast.success).toHaveBeenLastCalledWith('Pasted: Zoom 2', 1_500, undefined, {
      leadingIcon: 'paste',
    });
  });

  it('reports paste failures with the original error detail and expires highlights', () => {
    feedback.reportPasteError('The copied item does not fit at the playhead.');
    expect(toast.error).toHaveBeenCalledWith('Unable to paste: The copied item does not fit at the playhead.', 5_000);

    feedback.reportPasteSuccess('pasted-clip', item({ kind: 'item', name: 'clip.mp4' }));
    vi.advanceTimersByTime(899);
    expect(feedback.recentPaste.value).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(feedback.recentPaste.value).toBeNull();
  });
});
