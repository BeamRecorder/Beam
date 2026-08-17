import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimelineCanvasTransitionTrack from '../TimelineCanvasTransitionTrack.vue';
import type { ClipTransitions } from '~/media/shared/composition-types';

const transitions: ClipTransitions = {
  entry: { preset: { kind: 'fade' }, durationMs: 200 },
  exit: { preset: { kind: 'blur' }, durationMs: 300 },
};

const pointerEvent = (type: string, clientX: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  return event;
};

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('TimelineCanvasTransitionTrack', () => {
  it('renders accessible entry and exit zones with preset and duration labels', () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { mode: 'track', transitions, durationMs: 1_000 },
    });

    const entry = wrapper.get('.canvas-transition-zone.entry');
    const exit = wrapper.get('.canvas-transition-zone.exit');
    expect(entry.attributes('aria-label')).toContain('fade');
    expect(entry.attributes('aria-label')).toContain('200 ms');
    expect(exit.attributes('aria-label')).toContain('blur');
    expect(exit.attributes('aria-label')).toContain('300 ms');
    expect(entry.attributes('style')).toContain('width: 20%');
    expect(exit.attributes('style')).toContain('width: 30%');
  });

  it('previews an entry resize and commits it only on pointerup', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { mode: 'track', transitions, durationMs: 1_000 },
    });
    const track = wrapper.get('.canvas-track-content').element;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 1_000,
      height: 40,
      right: 1_100,
      bottom: 40,
    } as DOMRect);

    wrapper
      .get('.canvas-transition-zone.entry .duration-handle.end')
      .element.dispatchEvent(pointerEvent('pointerdown', 300));
    window.dispatchEvent(pointerEvent('pointermove', 700));

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')).toContainEqual([
      {
        entry: { preset: { kind: 'fade' }, durationMs: 600 },
        exit: { preset: { kind: 'blur' }, durationMs: 300 },
      },
    ]);

    window.dispatchEvent(pointerEvent('pointerup', 700));
    expect(wrapper.emitted('preview')).toContainEqual([null]);
    expect(wrapper.emitted('update')).toContainEqual([
      {
        entry: { preset: { kind: 'fade' }, durationMs: 600 },
        exit: { preset: { kind: 'blur' }, durationMs: 300 },
      },
    ]);
  });

  it('emits the selected edge when either zone is clicked', async () => {
    wrapper = mount(TimelineCanvasTransitionTrack, {
      props: { mode: 'track', transitions, durationMs: 1_000 },
    });

    await wrapper.get('.canvas-transition-zone.entry').trigger('click');
    await wrapper.get('.canvas-transition-zone.exit').trigger('click');

    expect(wrapper.emitted('open')).toEqual([['entry'], ['exit']]);
  });
});
