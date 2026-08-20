import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { VisualClip } from '~/media/shared/composition-types';
import {
  TimelineClipStub,
  mountTracks,
  pointerEvent,
  queueAnimationFrames,
  setPlaybackViewportGeometry,
  setScrubViewportGeometry,
} from './TimelineTracks.test-support';

describe('TimelineTracks', () => {
  it('scrolls the playhead into view when playback crosses the right boundary', async () => {
    const mounted = await mountTracks({ isPlaying: true });
    const scroll = setPlaybackViewportGeometry(mounted!);

    await mounted!.setProps({ currentTime: 8 });

    expect(scroll.scrollLeft).toBeGreaterThan(0);
  });

  it('does not move the timeline when a paused playhead crosses the right boundary', async () => {
    const mounted = await mountTracks({ isPlaying: false });
    const scroll = setPlaybackViewportGeometry(mounted!);

    await mounted!.setProps({ currentTime: 8 });

    expect(scroll.scrollLeft).toBe(0);
  });

  it('keeps scrubbing at the right edge and advances time across animation frames without pointer movement', async () => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    const { flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 615 });
    flushNextFrame();
    flushNextFrame();
    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    const firstTime = mounted!.emitted('update:currentTime')?.at(-1)?.[0] as number;
    flushNextFrame();
    flushNextFrame();
    const secondTime = mounted!.emitted('update:currentTime')?.at(-1)?.[0] as number;

    expect(scroll.scrollLeft).toBeGreaterThan(firstScrollLeft);
    expect(secondTime).toBeGreaterThan(firstTime);

    window.dispatchEvent(pointerEvent('pointerup', 615));
  });

  it('scrubs backward while held at the left edge', async () => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.scrollLeft = 400;
    const { flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 125 });
    flushNextFrame();
    flushNextFrame();
    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    flushNextFrame();

    expect(scroll.scrollLeft).toBeLessThan(firstScrollLeft);

    window.dispatchEvent(pointerEvent('pointercancel', 125));
  });

  it.each(['pointerup', 'pointercancel'] as const)('stops edge scrubbing after %s', async (endEvent) => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 615 });
    flushNextFrame();
    flushNextFrame();
    const stoppedScrollLeft = scroll.scrollLeft;
    window.dispatchEvent(pointerEvent(endEvent, 615));
    const emittedAtStop = mounted!.emitted('update:currentTime')?.length ?? 0;

    expect(pendingFrames.size).toBe(0);
    expect(scroll.scrollLeft).toBe(stoppedScrollLeft);
    expect(mounted!.emitted('update:currentTime')).toHaveLength(emittedAtStop);
  });

  it('does not auto-scroll while scrubbing in the center of the viewport', async () => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 370 });
    flushNextFrame();
    window.dispatchEvent(pointerEvent('pointermove', 370));

    expect(scroll.scrollLeft).toBe(0);
    expect(pendingFrames.size).toBe(1);
    flushNextFrame();
    expect(scroll.scrollLeft).toBe(0);

    window.dispatchEvent(pointerEvent('pointerup', 370));
  });

  it('virtualizes thumbnail requests to the viewport with two seconds of overscan and preserves the range on zoom', async () => {
    const mounted = await mountTracks();
    const scroll = mounted!.get('.timeline-tracks-container').element;
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      left: 520,
      top: 0,
      width: 400,
      height: 200,
      right: 920,
      bottom: 200,
    } as DOMRect);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();

    const screen = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screen) throw new Error('Expected the screen timeline clip stub to be mounted.');
    expect(screen?.props('thumbnailSlots')).toEqual([
      { timelineSeconds: 2, durationSeconds: 1 },
      { timelineSeconds: 3, durationSeconds: 1 },
      { timelineSeconds: 4, durationSeconds: 1 },
      { timelineSeconds: 5, durationSeconds: 1 },
      { timelineSeconds: 6, durationSeconds: 1 },
      { timelineSeconds: 7, durationSeconds: 1 },
      { timelineSeconds: 8, durationSeconds: 1 },
      { timelineSeconds: 9, durationSeconds: 1 },
    ]);

    await mounted!.setProps({ zoomLevel: 240 });
    expect(mounted!.get('.timeline-viewport').attributes('style')).toContain('width: calc(240% + 230px)');
    const thumbnailSlots = screen.props('thumbnailSlots') as
      | Array<{ timelineSeconds: number; durationSeconds: number }>
      | undefined;
    if (!thumbnailSlots) throw new Error('Expected thumbnail slots after viewport zoom.');
    expect(thumbnailSlots).toHaveLength(8);
    expect(thumbnailSlots[0]!).toEqual({ timelineSeconds: 2, durationSeconds: 1 });
  });
});
