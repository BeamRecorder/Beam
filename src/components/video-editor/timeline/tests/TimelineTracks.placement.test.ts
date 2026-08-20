import { describe, expect, it } from 'vitest';
import type { ClipComposition } from '~/media/shared/composition-types';
import { composition, mountTracks, zoom } from './TimelineTracks.test-support';

describe('TimelineTracks', () => {
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
    expect(mounted!.emitted('add:caption')).toContainEqual([{ startMs: 3_000, durationMs: 2_000 }]);
    await annotation.trigger('mousemove', { clientX: 950 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(true);
    await annotation.trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption')).toContainEqual([{ startMs: 7_300, durationMs: 2_000 }]);
    await annotation.trigger('mouseleave');
  });

  it('uses the configured zoom duration when centering the hover ghost', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000, zoomElements: [] });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 700 });

    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.left).toBe('33%');
    expect((ghost.element as HTMLElement).style.width).toBe('50%');
  });

  it('shifts the configured zoom duration into the free gap around a collision', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000 });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 700 });
    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.left).toBe('35%');
    expect((ghost.element as HTMLElement).style.width).toBe('50%');
    await cursor.trigger('click', { clientX: 700 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 3_500, durationMs: 5_000 }]);
  });

  it('emits the centered start for the configured zoom duration', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000, zoomElements: [] });
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
    expect(ghost.attributes('style')).toContain('left: 80%');
    expect(ghost.attributes('style')).toContain('width: 20%');

    await cursor.trigger('click', { clientX: 1_020 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([{ startMs: 8_000, durationMs: 2_000 }]);
  });

  it('hides the zoom ghost and does not emit when no zoom placement is available', async () => {
    const mounted = await mountTracks({ zoomElements: [zoom({ startMs: 0, endMs: 10_000 })] });
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
          ? { ...clip, timelineStartMs: 0, timelineDurationMs: 10_000, sourceDurationMs: 10_000 }
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
});
