import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';
import {
  TimelineClipStub,
  composition,
  getWaveformTestState,
  mountTracks,
  pointerEvent,
  queueAnimationFrames,
  setScrubViewportGeometry,
  visual,
} from './TimelineTracks.test-support';

describe('TimelineTracks', () => {
  it('moves and trims linked clips and zooms with clamped timeline bounds', async () => {
    const mounted = await mountTracks();
    const clips = mounted!.findAll('.visual-track .timeline-clip');
    await clips[2]!.trigger('pointerdown', { clientX: 120 });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    window.dispatchEvent(pointerEvent('pointerup', 500));
    expect(mounted!.emitted('move:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip' })]);

    await clips[2]!.find('.trim-handle.start').trigger('pointerdown', { clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 250));
    window.dispatchEvent(pointerEvent('pointerup', 250));
    expect(mounted!.emitted('trim:clip')).toContainEqual([
      expect.objectContaining({ id: 'screen-clip', edge: 'start' }),
    ]);
    await clips[2]!.find('.trim-handle.end').trigger('pointerdown', { clientX: 700 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    window.dispatchEvent(pointerEvent('pointerup', 900));
    expect(mounted!.emitted('trim:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip', edge: 'end' })]);

    const zoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    await zoomButton.trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 650));
    window.dispatchEvent(pointerEvent('pointerup', 650));
    expect(mounted!.emitted('move:zoom')).toContainEqual([expect.objectContaining({ id: 'zoom-1' })]);
    await zoomButton.trigger('pointerdown', { clientX: 400 });
    await zoomButton.find('.trim-handle.start').trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 100));
    window.dispatchEvent(pointerEvent('pointerup', 100));
    expect(mounted!.emitted('trim:zoom')).toContainEqual([expect.objectContaining({ id: 'zoom-1', edge: 'start' })]);
    await zoomButton.find('.trim-handle.end').trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    window.dispatchEvent(pointerEvent('pointerup', 900));
    expect(mounted!.emitted('trim:zoom')).toContainEqual([expect.objectContaining({ id: 'zoom-1', edge: 'end' })]);
  });

  it('keeps move and trim edits as local clip previews until pointerup commits them', async () => {
    const mounted = await mountTracks();
    const screenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screenClip) throw new Error('Expected the screen timeline clip stub.');

    const originalStart = (screenClip.props('clip') as VisualClip).timelineStartMs;
    await screenClip.trigger('pointerdown', { clientX: 120 });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBeGreaterThan(originalStart);
    expect(mounted!.emitted('preview:composition')).toContainEqual([
      expect.objectContaining({ clips: expect.any(Array) }),
    ]);
    expect(mounted!.emitted('move:clip') ?? []).toHaveLength(0);

    window.dispatchEvent(pointerEvent('pointerup', 500));
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect(mounted!.emitted('move:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip' })]);

    const originalDuration = (screenClip.props('clip') as VisualClip).timelineDurationMs;
    await screenClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 500 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineDurationMs).toBeGreaterThan(originalDuration);
    expect(mounted!.emitted('preview:composition')).toContainEqual([
      expect.objectContaining({ clips: expect.any(Array) }),
    ]);
    expect(mounted!.emitted('trim:clip') ?? []).toHaveLength(0);

    window.dispatchEvent(pointerEvent('pointerup', 900));
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect(mounted!.emitted('trim:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip', edge: 'end' })]);
  });

  it('grows the timeline proportionally and keeps auto-scrolling while extending a hold at the edge', async () => {
    const hold = visual({
      id: 'hold-clip',
      kind: 'video',
      name: 'Hold segment',
      trackId: 'hold-track',
      timelineStartMs: 4_000,
      timelineDurationMs: 1_000,
      sourceInMs: 2_000,
      sourceDurationMs: 1_000,
      freezeFrameSourceMs: 2_000,
      order: 0,
    });
    const following = visual({
      id: 'following-clip',
      kind: 'video',
      name: 'Following segment',
      trackId: 'hold-track',
      timelineStartMs: 5_000,
      timelineDurationMs: 1_000,
      sourceInMs: 3_000,
      sourceDurationMs: 1_000,
      order: 0,
    });
    const holdComposition: ClipComposition = {
      ...composition(),
      clips: [hold, following],
    };
    const mounted = await mountTracks({
      composition: holdComposition,
      duration: 5,
      selectedClipId: hold.id,
      isSnappingEnabled: false,
    });
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const viewport = mounted!.get('.timeline-viewport').element as HTMLElement;
    const initialWaveformViewport = getWaveformTestState().viewport?.();
    if (!initialWaveformViewport) throw new Error('Expected the waveform viewport probe.');
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');

    const holdClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === hold.id);
    if (!holdClip) throw new Error('Expected the hold timeline clip stub.');
    const initialThumbnailSlots = holdClip.props('thumbnailSlots');
    expect(holdClip.props('deferThumbnailRequests')).toBe(false);

    await holdClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 220 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    flushNextFrame();
    await flushPromises();

    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    expect(preview?.clips.find((clip) => clip.id === hold.id)).toMatchObject({
      timelineStartMs: 4_000,
      timelineDurationMs: 2_000,
      sourceInMs: 2_000,
      freezeFrameSourceMs: 2_000,
    });
    expect(preview?.clips.find((clip) => clip.id === following.id)).toMatchObject({ timelineStartMs: 6_000 });
    expect(holdClip.props('duration')).toBe(7);
    expect(viewport.style.width).toBe('calc(168% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(140% + 230px)');
    expect(viewport.classList).toContain('is-trimming');
    expect(holdClip.props('thumbnailSlots')).toBe(initialThumbnailSlots);
    expect(holdClip.props('deferThumbnailRequests')).toBe(true);
    expect(getWaveformTestState().viewport?.()).toBe(initialWaveformViewport);
    expect(pendingFrames.size).toBe(1);

    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    await flushPromises();
    const secondScrollLeft = scroll.scrollLeft;
    const previewAfterFirstScroll = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    expect(previewAfterFirstScroll?.clips.find((clip) => clip.id === hold.id)?.timelineDurationMs).toBeGreaterThan(
      2_000,
    );
    flushNextFrame();
    await flushPromises();
    const thirdScrollLeft = scroll.scrollLeft;

    expect(secondScrollLeft).toBeGreaterThan(firstScrollLeft);
    expect(thirdScrollLeft).toBeGreaterThan(secondScrollLeft);
    expect(holdClip.props('thumbnailSlots')).toBe(initialThumbnailSlots);
    expect(holdClip.props('deferThumbnailRequests')).toBe(true);
    expect(getWaveformTestState().viewport?.()).toBe(initialWaveformViewport);
    expect(pendingFrames.size).toBe(1);
    window.dispatchEvent(pointerEvent('pointerup', 900));
    await flushPromises();

    const stoppedScrollLeft = scroll.scrollLeft;
    expect(viewport.classList).not.toContain('is-trimming');
    expect(holdClip.props('deferThumbnailRequests')).toBe(false);
    expect(getWaveformTestState().viewport?.()).not.toBe(initialWaveformViewport);
    expect(pendingFrames.size).toBe(0);
    await flushPromises();
    expect(scroll.scrollLeft).toBe(stoppedScrollLeft);
  });

  it('keeps the timeline scale stable so a shortening hold follows the pointer', async () => {
    const hold = visual({
      id: 'shorten-hold',
      kind: 'video',
      name: 'Hold segment',
      trackId: 'shorten-hold-track',
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
    scroll.scrollLeft = 500;
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const viewport = mounted!.get('.timeline-viewport').element as HTMLElement;
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');
    expect(mounted!.findAll('.marker-label').at(-1)?.text()).toBe('8s');

    const holdClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === hold.id);
    if (!holdClip) throw new Error('Expected the hold timeline clip stub.');

    await holdClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 120));
    flushNextFrame();
    await flushPromises();

    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    expect(preview?.clips.find((clip) => clip.id === hold.id)).toMatchObject({
      timelineStartMs: 5_000,
      timelineDurationMs: 1_000,
      sourceInMs: 2_000,
      freezeFrameSourceMs: 2_000,
    });
    expect(holdClip.props('duration')).toBe(8);
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');
    expect(mounted!.findAll('.marker-label').at(-1)?.text()).toBe('8s');
    expect(viewport.classList).toContain('is-trimming');
    expect(pendingFrames.size).toBe(1);

    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    await flushPromises();
    expect(scroll.scrollLeft).toBeLessThan(firstScrollLeft);
    expect(mounted!.emitted('preview:composition')?.at(-1)?.[0]).toMatchObject({
      clips: expect.arrayContaining([expect.objectContaining({ id: hold.id, timelineDurationMs: expect.any(Number) })]),
    });

    window.dispatchEvent(pointerEvent('pointerup', 120));
    await flushPromises();
    const stoppedScrollLeft = scroll.scrollLeft;
    expect(viewport.classList).not.toContain('is-trimming');
    expect(pendingFrames.size).toBe(0);
    await flushPromises();
    expect(scroll.scrollLeft).toBe(stoppedScrollLeft);
  });
});
