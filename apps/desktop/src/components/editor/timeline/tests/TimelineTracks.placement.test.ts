import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import { composition, mountTracks, zoom } from './TimelineTracks.test-support';

describe('TimelineTracks', () => {
  it.each([
    [0.75, 750],
    [1.25, 1_250],
  ])('keeps the zoom ghost at the same timeline time at UI scale %s', async (_scale, visualWidth) => {
    const mounted = await mountTracks({ zoomElements: [] });
    const ticks = mounted!.get('.ruler-ticks-area').element;
    vi.mocked(ticks.getBoundingClientRect).mockReturnValue({
      left: 120,
      top: 0,
      width: visualWidth,
      height: 28,
      right: 120 + visualWidth,
      bottom: 28,
    } as DOMRect);
    Object.defineProperty(ticks, 'offsetWidth', {
      configurable: true,
      value: 1_000,
    });
    Object.defineProperty(ticks, 'clientWidth', {
      configurable: true,
      value: 1_000,
    });
    mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
    await flushPromises();

    const cursor = mounted!.get('.cursor-content');
    await cursor.trigger('mousemove', { clientX: 120 + visualWidth * 0.6 });
    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.transform).toBe('translate3d(540px, 0, 0)');
    expect(ghost.attributes('style')).toContain('width: 12%');

    await cursor.trigger('click', { clientX: 120 + visualWidth * 0.6 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 5_400, durationMs: 1_200 }]);
  });

  it('previews and adds zooms/captions fitted into available gaps', async () => {
    const mounted = await mountTracks();
    const cursor = mounted!.get('.cursor-content');
    const annotation = mounted!.get('.annotation-content');

    await cursor.trigger('mousemove', { clientX: 900 });
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(true);
    await cursor.trigger('click', { clientX: 900 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 7_200, durationMs: 1_200 }]);
    await cursor.trigger('mouseleave');
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(false);

    await cursor.trigger('mousemove', { clientX: 300 });
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(true);
    await cursor.trigger('click', { clientX: 300 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 800, durationMs: 1_200 }]);

    await annotation.trigger('mousemove', { clientX: 600 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(true);
    await annotation.trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:caption')).toContainEqual([
      { startMs: 3_000, durationMs: 2_000, targetClipId: 'caption-clip' },
    ]);
    await annotation.trigger('mousemove', { clientX: 950 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(true);
    await annotation.trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption')).toContainEqual([
      { startMs: 7_300, durationMs: 2_000, targetClipId: 'caption-clip' },
    ]);
    await annotation.trigger('mouseleave');
  });

  it('uses the configured zoom duration when centering the hover ghost', async () => {
    const mounted = await mountTracks({
      newZoomDurationMs: 5_000,
      zoomElements: [],
    });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 700 });

    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.transform).toBe('translate3d(330px, 0, 0)');
    expect((ghost.element as HTMLElement).style.width).toBe('50%');
  });

  it('shifts the configured zoom duration into the free gap around a collision', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000 });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 700 });
    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.transform).toBe('translate3d(350px, 0, 0)');
    expect((ghost.element as HTMLElement).style.width).toBe('50%');
    await cursor.trigger('click', { clientX: 700 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 3_500, durationMs: 5_000 }]);
  });

  it('emits the centered start for the configured zoom duration', async () => {
    const mounted = await mountTracks({
      newZoomDurationMs: 5_000,
      zoomElements: [],
    });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('click', { clientX: 700 });

    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 3_300, durationMs: 5_000 }]);
  });

  it('shows and emits a shortened zoom fitted into the free gap after an existing eight-second zoom', async () => {
    const mounted = await mountTracks({
      zoomElements: [zoom({ startMs: 0, endMs: 8_000 })],
      newZoomDurationMs: 5_000,
    });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 1_020 });
    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.transform).toBe('translate3d(800px, 0, 0)');
    expect(ghost.attributes('style')).toContain('width: 20%');

    await cursor.trigger('click', { clientX: 1_020 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 8_000, durationMs: 2_000 }]);
  });

  it('hides the zoom ghost and does not emit when no zoom placement is available', async () => {
    const mounted = await mountTracks({
      zoomElements: [zoom({ startMs: 0, endMs: 10_000 })],
    });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 600 });
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(false);

    await cursor.trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:zoom') ?? []).toHaveLength(0);
  });

  it('hides the caption ghost and does not emit when no caption placement is available', async () => {
    const base = composition();
    const occupiedComposition: ClipComposition = {
      ...base,
      clips: base.clips.map((clip) =>
        clip.kind === 'caption' && clip.caption.type === 'text'
          ? {
              ...clip,
              timelineStartMs: 0,
              timelineDurationMs: 10_000,
              sourceDurationMs: 10_000,
            }
          : clip,
      ),
    };
    const mounted = await mountTracks({ composition: occupiedComposition });
    const annotation = mounted!.get('.annotation-content');

    await annotation.trigger('mousemove', { clientX: 600 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(false);

    await annotation.trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:caption') ?? []).toHaveLength(0);
  });

  it('fits a new caption into the clicked track even when another track covers that time', async () => {
    const source = composition();
    const target = source.clips.find((clip) => clip.id === 'caption-clip')!;
    const other = {
      ...target,
      id: 'other-caption',
      captionLayerId: 'other-track',
      timelineStartMs: 0,
      timelineDurationMs: 10000,
      sourceDurationMs: 10000,
      order: target.order + 1,
    };
    source.clips.push(other);
    const mounted = await mountTracks({ composition: source });
    const track = mounted!
      .findAll('.tracks-stack .text-caption-layer')
      .find((row) => row.find('[data-timeline-clip-id="caption-clip"]').exists())!;
    await track.get('.annotation-content').trigger('mousemove', { clientX: 600 });
    expect(track.find('.preview-ghost').exists()).toBe(true);
    await track.get('.annotation-content').trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:caption')).toContainEqual([
      { startMs: 3000, durationMs: 2000, targetClipId: 'caption-clip' },
    ]);
  });

  it('does not offer insertion into a locked caption track', async () => {
    const source = composition();
    source.clips = source.clips.map((clip) => (clip.id === 'caption-clip' ? { ...clip, locked: true } : clip));
    const mounted = await mountTracks({ composition: source });
    const content = mounted!.get('.tracks-stack .text-caption-layer .annotation-content');
    await content.trigger('mousemove', { clientX: 600 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(false);
    await content.trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:caption')).toBeUndefined();
  });

  it('creates the first caption from the empty-track placeholder without a target', async () => {
    const source = composition();
    source.clips = source.clips.filter((clip) => clip.kind !== 'caption');
    const mounted = await mountTracks({ composition: source });
    await mounted!.get('.tracks-stack .text-caption-track .annotation-content').trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:caption')).toContainEqual([{ startMs: 3800, durationMs: 2000 }]);
  });
});
