import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import CaptionInlineEditor from './CaptionInlineEditor.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string) =>
      ({
        captionText: 'Caption text',
        aiTimingEditWarning: 'Changing this text may disrupt synchronized words.',
      })[key] ?? key,
  }),
}));

type TextCaptionClip = CaptionClip & { caption: { type: 'text' } };

const createClip = (options: { isAiGenerated?: boolean; customText?: string } = {}): TextCaptionClip => ({
  id: 'caption-1',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  isAiGenerated: options.isAiGenerated,
  caption: {
    type: 'text',
    sentences: [
      {
        id: 'sentence-1',
        text: 'Hello world',
        startMs: 0,
        endMs: 1_000,
        words: [
          { text: 'Hello', startMs: 0, endMs: 500 },
          { text: 'world', startMs: 500, endMs: 1_000 },
        ],
      },
    ],
    style: {
      ...createDefaultCaptionStyle(36),
      ...(options.customText === undefined ? {} : { customText: options.customText }),
    },
  },
});

const mountEditor = (clip = createClip(), warningPlacement: 'above' | 'below' = 'above') =>
  mount(CaptionInlineEditor, {
    props: {
      clip,
      viewportStyle: { left: '0px', top: '0px', width: '800px', height: '450px' },
      layoutStyle: { left: '10px', top: '20px', width: '240px', height: '48px' },
      renderScale: 1,
      warningPlacement,
    },
    attachTo: document.body,
  });

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

describe('CaptionInlineEditor', () => {
  it('focuses the native textarea and places the caret at the end', async () => {
    wrapper = mountEditor(createClip({ customText: 'Edited caption' }));
    await nextTick();
    await nextTick();

    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe('Edited caption');
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
  });

  it('coalesces rapid native textarea input updates and emits the latest value after the debounce', async () => {
    wrapper = mountEditor();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Hello');
    expect(wrapper.emitted('update')).toBeUndefined();

    await textarea.setValue('Hello there');
    expect(wrapper.emitted('update')).toBeUndefined();

    vi.advanceTimersByTime(149);
    expect(wrapper.emitted('update')).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(wrapper.emitted('update')).toEqual([['Hello there']]);
  });

  it('flushes one pending update on blur without emitting it again after the timer', async () => {
    wrapper = mountEditor();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Edited on blur');
    await textarea.trigger('blur');

    expect(wrapper.emitted('update')).toEqual([['Edited on blur']]);
    expect(wrapper.emitted('finish')).toHaveLength(1);

    vi.advanceTimersByTime(150);
    expect(wrapper.emitted('update')).toEqual([['Edited on blur']]);
  });

  it.each([
    ['Ctrl+Enter', { ctrlKey: true }],
    ['Cmd+Enter', { metaKey: true }],
  ])('flushes one pending update on %s without emitting it again after the timer', async (_label, modifiers) => {
    wrapper = mountEditor();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Edited with shortcut');
    await textarea.trigger('keydown', { key: 'Enter', ...modifiers });

    expect(wrapper.emitted('update')).toEqual([['Edited with shortcut']]);
    expect(wrapper.emitted('finish')).toHaveLength(1);

    vi.advanceTimersByTime(150);
    expect(wrapper.emitted('update')).toEqual([['Edited with shortcut']]);
  });

  it('discards a pending update on Escape and cancels the edit', async () => {
    wrapper = mountEditor();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Discard me');
    await textarea.trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('finish')).toBeUndefined();

    vi.advanceTimersByTime(150);
    expect(wrapper.emitted('update')).toBeUndefined();
  });

  it('clears a pending update timer when unmounted', async () => {
    wrapper = mountEditor();
    const textarea = wrapper.get('textarea');

    await textarea.setValue('Unmount me');
    wrapper.unmount();

    vi.advanceTimersByTime(150);
    expect(wrapper.emitted('update')).toBeUndefined();
  });

  it('forces the native WebKit text fill to match the caption color while editing', () => {
    wrapper = mountEditor();
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement;

    expect(textarea.style.color).toBe('rgb(255, 255, 255)');
    expect(textarea.style.webkitTextFillColor).toBe('rgb(255, 255, 255)');
    expect(textarea.style.paintOrder).toBe('stroke fill');
    expect(getComputedStyle(textarea).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('cancels on Escape without finishing the edit', async () => {
    wrapper = mountEditor();

    await wrapper.get('textarea').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('finish')).toBeUndefined();
  });

  it.each([
    ['Ctrl+Enter', { ctrlKey: true }],
    ['Cmd+Enter', { metaKey: true }],
  ])('finishes on %s', async (_label, modifiers) => {
    wrapper = mountEditor();

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ...modifiers });

    expect(wrapper.emitted('finish')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('shows the translated warning only for AI captions and supports below placement', () => {
    wrapper = mountEditor(createClip({ isAiGenerated: true }), 'below');

    const warning = wrapper.get('[role="status"]');
    expect(warning.text()).toBe('Changing this text may disrupt synchronized words.');
    expect(warning.classes()).toContain('is-below');

    wrapper.unmount();
    wrapper = mountEditor(createClip({ isAiGenerated: false }));
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
});
