import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import { clipTrimBounds } from '../../composition/engine/trim-clip';
import {
  TimelineClipStub,
  asset,
  composition,
  mountTracks,
  pointerEvent,
  queueAnimationFrames,
  setScrubViewportGeometry,
  visual,
  zoom,
} from './TimelineTracks.test-support';

describe('TimelineTracks', () => {
  it('keeps the last hold trim preview bounded when viewport shrink clamps scrollLeft', async () => {
    const hold = visual({
      id: 'clamped-hold',
      kind: 'video',
      name: 'Last hold segment',
      trackId: 'clamped-hold-track',
      timelineStartMs: 5_000,
      timelineDurationMs: 3_000,
      sourceInMs: 2_000,
      sourceDurationMs: 3_000,
      freezeFrameSourceMs: 2_000,
      order: 0,
    });
    const mounted = await mountTracks({
      composition: { ...composition(), clips: [hold] },
      duration: 8,
      selectedClipId: hold.id,
      isSnappingEnabled: false,
    });
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    let browserScrollLeft = 500;
    Object.defineProperty(scroll, 'scrollLeft', {
      configurable: true,
      get: () => browserScrollLeft,
      set: (value: number) => {
        browserScrollLeft = Math.max(0, value);
      },
    });
    scroll.scrollLeft = browserScrollLeft;
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const viewport = mounted!.get('.timeline-viewport').element as HTMLElement;
    const holdClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === hold.id);
    if (!holdClip) throw new Error('Expected the hold timeline clip stub.');

    await holdClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 120));
    flushNextFrame();
    await flushPromises();

    const previewBeforeClamp = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    const holdBeforeClamp = previewBeforeClamp?.clips.find((clip) => clip.id === hold.id);
    if (!holdBeforeClamp) throw new Error('Expected the initial last-hold trim preview.');
    const previewEventCount = mounted!.emitted('preview:composition')?.length ?? 0;
    expect(holdBeforeClamp.timelineStartMs + holdBeforeClamp.timelineDurationMs).toBe(6_000);
    expect(holdClip.props('duration')).toBe(8);

    // Browser scroll containers clamp scrollLeft when the just-shortened viewport shrinks.
    scroll.scrollLeft = 0;
    scroll.dispatchEvent(new Event('scroll'));
    for (let frame = 0; frame < 20 && pendingFrames.size > 0; frame += 1) {
      flushNextFrame();
      await flushPromises();
    }

    const previewAfterClamp = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    const holdAfterClamp = previewAfterClamp?.clips.find((clip) => clip.id === hold.id);
    expect(holdAfterClamp).toMatchObject({ timelineStartMs: 5_000, timelineDurationMs: 1_000 });
    expect(mounted!.emitted('preview:composition')).toHaveLength(previewEventCount);
    expect(holdClip.props('duration')).toBe(8);
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');

    window.dispatchEvent(pointerEvent('pointerup', 120));
    await flushPromises();
    expect(pendingFrames.size).toBe(0);
  });

  it('clamps a grouped video trim preview to the shortest source bound without snapping back on pointerup', async () => {
    const groupedComposition: ClipComposition = {
      schemaVersion: 6,
      keyboardCaptionSessions: [],
      assets: [
        { ...asset('long-video', 'video'), durationMs: 8_000 },
        { ...asset('short-video', 'video'), durationMs: 3_000 },
      ],
      clips: [
        visual({
          id: 'grouped-video',
          kind: 'video',
          name: 'Grouped video',
          assetId: 'long-video',
          timelineDurationMs: 2_000,
          sourceDurationMs: 2_000,
          groupId: 'source-group',
          trackId: 'video-track',
        }),
        visual({
          id: 'grouped-short',
          kind: 'webcam',
          name: 'Grouped short source',
          assetId: 'short-video',
          timelineDurationMs: 2_000,
          sourceDurationMs: 2_000,
          groupId: 'source-group',
          trackId: 'webcam-track',
        }),
      ],
    };
    const mounted = await mountTracks({
      composition: groupedComposition,
      selectedClipId: 'grouped-video',
      isSnappingEnabled: false,
    });
    const bounds = clipTrimBounds(groupedComposition, 'grouped-video', 'end');
    expect(bounds.maxMs).toBe(3_000);
    const videoClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'grouped-video');
    if (!videoClip) throw new Error('Expected the grouped video timeline clip stub.');

    await videoClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 600));
    await flushPromises();

    const previews = mounted!.emitted('preview:composition') ?? [];
    const preview = previews.at(-1)?.[0] as ClipComposition | undefined;
    const previewClip = preview?.clips.find((clip) => clip.id === 'grouped-video');
    if (!previewClip) throw new Error('Expected a grouped video trim preview.');
    expect(previewClip.timelineStartMs + previewClip.timelineDurationMs).toBe(bounds.maxMs);
    expect(preview?.clips.find((clip) => clip.id === 'grouped-short')).toMatchObject({
      timelineStartMs: 0,
      timelineDurationMs: bounds.maxMs,
    });
    expect(mounted!.emitted('trim:clip') ?? []).toHaveLength(0);

    window.dispatchEvent(pointerEvent('pointerup', 600));

    const trimEvents = mounted!.emitted('trim:clip') ?? [];
    expect(trimEvents.at(-1)?.[0]).toEqual({ id: 'grouped-video', edge: 'end', timeMs: bounds.maxMs });
  });

  it('releases the zoom trim preview when the trim ends so later props control the indicator', async () => {
    const mounted = await mountTracks();
    const zoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');

    await zoomButton.find('.trim-handle.start').trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 100));
    window.dispatchEvent(pointerEvent('pointerup', 100));

    await mounted!.setProps({ zoomElements: [zoom({ startMs: 7_000, endMs: 8_500 })] });
    const updatedZoom = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    expect(updatedZoom.attributes('style')).toContain('left: 70%');
    expect(updatedZoom.attributes('style')).toContain('width: 15%');
  });

  it('cleans a clip move preview and does not emit a move on pointercancel', async () => {
    const mounted = await mountTracks();
    const screenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screenClip) throw new Error('Expected the screen timeline clip stub.');

    await screenClip.trigger('pointerdown', { clientX: 120 });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBeGreaterThan(0);
    window.dispatchEvent(pointerEvent('pointercancel', 500));
    await flushPromises();
    expect(mounted!.emitted('move:clip') ?? []).toHaveLength(0);
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBe(0);

    const nextComposition = composition();
    nextComposition.clips = nextComposition.clips.map((clip) =>
      clip.id === 'screen-clip' ? { ...clip, timelineStartMs: 7_000 } : clip,
    );
    await mounted!.setProps({ composition: nextComposition });
    const updatedScreenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    expect((updatedScreenClip?.props('clip') as VisualClip).timelineStartMs).toBe(7_000);
  });

  it('cleans a clip trim preview and does not emit a trim on pointercancel', async () => {
    const mounted = await mountTracks();
    const screenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screenClip) throw new Error('Expected the screen timeline clip stub.');

    await screenClip.find('.trim-handle.start').trigger('pointerdown', { clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 250));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBeGreaterThan(0);
    window.dispatchEvent(pointerEvent('pointercancel', 250));
    await flushPromises();
    expect(mounted!.emitted('trim:clip') ?? []).toHaveLength(0);
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBe(0);

    const nextComposition = composition();
    nextComposition.clips = nextComposition.clips.map((clip) =>
      clip.id === 'screen-clip' ? { ...clip, timelineStartMs: 6_500, timelineDurationMs: 2_500 } : clip,
    );
    await mounted!.setProps({ composition: nextComposition });
    const updatedScreenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    const updatedClip = updatedScreenClip?.props('clip') as VisualClip | undefined;
    expect(updatedClip?.timelineStartMs).toBe(6_500);
    expect(updatedClip?.timelineDurationMs).toBe(2_500);
  });

  it('cleans zoom move and trim previews on pointercancel without emitting either edit', async () => {
    const mounted = await mountTracks();
    const zoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');

    await zoomButton.trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 650));
    window.dispatchEvent(pointerEvent('pointercancel', 650));
    expect(mounted!.emitted('move:zoom') ?? []).toHaveLength(0);

    await mounted!.setProps({ zoomElements: [zoom({ startMs: 6_000, endMs: 7_500 })] });
    const updatedZoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    await updatedZoomButton.find('.trim-handle.end').trigger('pointerdown', { clientX: 700 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    window.dispatchEvent(pointerEvent('pointercancel', 900));
    expect(mounted!.emitted('trim:zoom') ?? []).toHaveLength(0);

    await mounted!.setProps({ zoomElements: [zoom({ startMs: 8_000, endMs: 9_500 })] });
    const finalZoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    expect(finalZoomButton.attributes('style')).toContain('left: 80%');
    expect(finalZoomButton.attributes('style')).toContain('width: 15%');
  });
});
