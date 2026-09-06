import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { VisualClip } from '~/media/shared/composition-types';
import {
  composition,
  contextMenuButton,
  mountTracks,
  pointerEvent,
  queueAnimationFrames,
  TimelineClipStub,
  visual,
  zoom,
} from './TimelineTracks.test-support';

const findClip = (mounted: Awaited<ReturnType<typeof mountTracks>>, id: string) => {
  const clip = mounted
    ?.findAllComponents(TimelineClipStub)
    .find((component) => (component.props('clip') as VisualClip).id === id);
  if (!clip) throw new Error(`Expected the ${id} timeline clip stub.`);
  return clip;
};

const pointerEventWithId = (type: string, pointerId: number, clientX: number, clientY = 10, button = 0) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
    button: { value: button },
    target: { value: document.body },
  });
  return event;
};

const largeMixedSelection = () => {
  const clips = Array.from({ length: 12 }, (_, index) =>
    visual({
      id: `selected-clip-${index + 1}`,
      name: `Selected ${index + 1}`,
      trackId: `selected-track-${index + 1}`,
      timelineStartMs: 500 + index * 700,
      timelineDurationMs: 300,
      sourceDurationMs: 300,
      order: index,
    }),
  );
  const zooms = [
    zoom({ id: 'selected-zoom-1', startMs: 3_000, endMs: 4_000 }),
    zoom({ id: 'selected-zoom-2', startMs: 7_000, endMs: 8_000 }),
  ];
  return {
    clips,
    zooms,
    clipIds: clips.map((clip) => clip.id),
    zoomIds: zooms.map((zoom) => zoom.id),
    composition: { ...composition(), clips },
  };
};

describe('TimelineTracks selection', () => {
  it('emits a replace selection intent for a plain clip click', async () => {
    const mounted = await mountTracks({ selectedClipId: null, selectedClipIds: [] });

    await findClip(mounted, 'image-clip').trigger('click');

    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'clip', id: 'image-clip', intent: 'replace' }]);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
  ])('emits a toggle selection intent for a %s-click', async (_label, modifiers) => {
    const mounted = await mountTracks({ selectedClipId: 'screen-clip', selectedClipIds: ['screen-clip'] });

    await findClip(mounted, 'image-clip').trigger('click', modifiers);

    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'clip', id: 'image-clip', intent: 'toggle' }]);
  });

  it('emits the complete chronological range for a Shift-click', async () => {
    const first = visual({
      id: 'range-first',
      name: 'First segment',
      trackId: 'range-first-track',
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
    });
    const middle = visual({
      id: 'range-middle',
      name: 'Middle segment',
      trackId: 'range-middle-track',
      timelineStartMs: 3_000,
      timelineDurationMs: 1_000,
    });
    const last = visual({
      id: 'range-last',
      name: 'Last segment',
      trackId: 'range-last-track',
      timelineStartMs: 5_000,
      timelineDurationMs: 1_000,
    });
    const mounted = await mountTracks({
      composition: { ...composition(), clips: [first, middle, last] },
      selectedClipId: first.id,
      selectedClipIds: [first.id],
    });

    await findClip(mounted, last.id).trigger('click', { shiftKey: true });

    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'clip', id: last.id, intent: 'range' }]);
  });

  it('ignores a right-button clip press for movement and item selection', async () => {
    const mounted = await mountTracks({ selectedClipId: 'screen-clip', selectedClipIds: ['screen-clip'] });
    const screenClip = findClip(mounted, 'screen-clip');

    await screenClip.trigger('pointerdown', { button: 2, pointerId: 7, clientX: 200, clientY: 20 });
    window.dispatchEvent(pointerEventWithId('pointercancel', 7, 200, 20, 2));

    expect(mounted!.emitted('select:item')).toBeUndefined();
    expect(mounted!.emitted('preview:composition')).toBeUndefined();
    expect(mounted!.emitted('move:clip')).toBeUndefined();
    expect(mounted!.emitted('move:selection')).toBeUndefined();
  });

  it('selects a mixed group once on drag and suppresses its trailing click', async () => {
    const mounted = await mountTracks({
      isSnappingEnabled: false,
      selectedClipId: 'screen-clip',
      selectedClipIds: ['screen-clip', 'webcam-clip'],
      selectedZoomId: 'zoom-1',
      selectedZoomIds: ['zoom-1'],
    });
    const screenClip = findClip(mounted, 'screen-clip');
    mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
    await flushPromises();

    await screenClip.trigger('pointerdown', { button: 0, pointerId: 11, clientX: 200, clientY: 20 });
    window.dispatchEvent(pointerEventWithId('pointermove', 11, 300, 20));
    await flushPromises();
    window.dispatchEvent(pointerEventWithId('pointerup', 11, 300, 20));
    await flushPromises();

    expect(mounted!.emitted('move:selection')).toEqual([
      [{ clipIds: ['screen-clip', 'webcam-clip'], zoomIds: ['zoom-1'], deltaMs: 1_000 }],
    ]);
    expect(mounted!.emitted('select:item')).toBeUndefined();

    screenClip.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flushPromises();
    expect(mounted!.emitted('select:item')).toBeUndefined();
  });

  it('previews every clip and zoom in a large mixed selection with one shared delta', async () => {
    const fixture = largeMixedSelection();
    const mounted = await mountTracks({
      duration: 12,
      composition: fixture.composition,
      zoomElements: fixture.zooms,
      selectedClipId: fixture.clipIds[0],
      selectedClipIds: fixture.clipIds,
      selectedZoomId: fixture.zoomIds[0],
      selectedZoomIds: fixture.zoomIds,
      isSnappingEnabled: false,
    });
    mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
    await flushPromises();

    expect(mounted!.findAll('.tracks-stack .visual-track')).toHaveLength(12);
    const anchor = findClip(mounted, fixture.clipIds[0]!);
    await anchor.trigger('pointerdown', { button: 0, pointerId: 41, clientX: 200 });
    await flushPromises();
    expect(mounted!.get('.timeline-viewport').classes()).toContain('is-moving');
    for (const clipId of fixture.clipIds) {
      expect(findClip(mounted, clipId).props('deferThumbnailRequests')).toBe(true);
    }

    window.dispatchEvent(pointerEvent('pointermove', 300));
    await flushPromises();

    const deltaMs = 1_200;
    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as typeof fixture.composition | undefined;
    expect(preview).toBeDefined();
    for (const clip of fixture.clips) {
      expect(preview?.clips.find((entry) => entry.id === clip.id)).toMatchObject({
        timelineStartMs: clip.timelineStartMs + deltaMs,
        timelineDurationMs: clip.timelineDurationMs,
      });
    }
    const zoomPreview = mounted!.emitted('preview:zooms')?.at(-1)?.[0] as typeof fixture.zooms | undefined;
    expect(zoomPreview).toBeDefined();
    for (const zoom of fixture.zooms) {
      expect(zoomPreview?.find((entry) => entry.id === zoom.id)).toMatchObject({
        startMs: zoom.startMs + deltaMs,
        endMs: zoom.endMs + deltaMs,
      });
    }
    expect(fixture.composition.clips.map((clip) => clip.timelineStartMs)).toEqual(
      fixture.clips.map((clip) => clip.timelineStartMs),
    );
    expect(fixture.zooms.map((zoom) => zoom.startMs)).toEqual([3_000, 7_000]);
    expect(mounted!.emitted('move:selection')).toBeUndefined();

    window.dispatchEvent(pointerEvent('pointerup', 300));
    await flushPromises();
    expect(mounted!.emitted('move:selection')).toEqual([
      [{ clipIds: fixture.clipIds, zoomIds: fixture.zoomIds, deltaMs }],
    ]);
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect(mounted!.emitted('preview:zooms')?.at(-1)).toEqual([null]);
    expect(mounted!.get('.timeline-viewport').classes()).not.toContain('is-moving');
    for (const clipId of fixture.clipIds) {
      expect(findClip(mounted, clipId).props('deferThumbnailRequests')).toBe(false);
    }
  });

  it('coalesces duplicate pointer moves and commits one mixed-selection delta', async () => {
    const fixture = largeMixedSelection();
    const mounted = await mountTracks({
      duration: 12,
      composition: fixture.composition,
      zoomElements: fixture.zooms,
      selectedClipId: fixture.clipIds[0],
      selectedClipIds: fixture.clipIds,
      selectedZoomId: fixture.zoomIds[0],
      selectedZoomIds: fixture.zoomIds,
      isSnappingEnabled: false,
    });
    mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
    await flushPromises();
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const anchor = findClip(mounted, fixture.clipIds[0]!);

    await anchor.trigger('pointerdown', { button: 0, pointerId: 42, clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 300));
    window.dispatchEvent(pointerEvent('pointermove', 300));
    window.dispatchEvent(pointerEvent('pointermove', 300));

    expect(pendingFrames.size).toBe(1);
    expect(mounted!.emitted('preview:composition')).toBeUndefined();
    flushNextFrame();
    await flushPromises();
    expect(mounted!.emitted('preview:composition')).toHaveLength(1);
    expect(mounted!.emitted('preview:zooms')).toHaveLength(1);

    window.dispatchEvent(pointerEvent('pointermove', 300));
    expect(pendingFrames.size).toBe(1);
    flushNextFrame();
    await flushPromises();
    expect(mounted!.emitted('preview:composition')).toHaveLength(1);
    expect(mounted!.emitted('preview:zooms')).toHaveLength(1);

    window.dispatchEvent(pointerEvent('pointerup', 300));
    await flushPromises();
    expect(mounted!.emitted('move:selection')).toEqual([
      [{ clipIds: fixture.clipIds, zoomIds: fixture.zoomIds, deltaMs: 1_200 }],
    ]);
  });

  it('emits box selection ids from the mixed timeline surface', async () => {
    const mounted = await mountTracks({
      selectedClipId: null,
      selectedClipIds: [],
      selectedZoomId: null,
      selectedZoomIds: [],
    });
    const surface = mounted!.get('.timeline-selection-surface').element;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1_000,
      height: 200,
      right: 1_000,
      bottom: 200,
    } as DOMRect);
    const setRect = (element: Element, left: number, top: number, width: number, height: number) => {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
      } as DOMRect);
    };
    setRect(mounted!.get('[data-timeline-clip-id="screen-clip"]').element, 100, 20, 120, 30);
    setRect(mounted!.get('[data-timeline-clip-id="webcam-clip"]').element, 250, 20, 120, 30);
    setRect(mounted!.get('[data-timeline-zoom-id="zoom-1"]').element, 160, 80, 180, 30);

    await mounted!.get('.timeline-selection-surface').trigger('pointerdown', {
      button: 2,
      pointerId: 13,
      clientX: 50,
      clientY: 10,
    });
    window.dispatchEvent(pointerEventWithId('pointermove', 13, 400, 130, 2));
    await flushPromises();
    expect(mounted!.emitted('select:box')).toEqual([
      [{ clipIds: ['webcam-clip', 'screen-clip'], zoomIds: ['zoom-1'] }],
    ]);

    window.dispatchEvent(pointerEventWithId('pointerup', 13, 400, 130, 2));
  });

  it('keeps an existing multi-selection when opening a selected clip context menu', async () => {
    const selectedIds = ['screen-clip', 'webcam-clip', 'image-clip'];
    const mounted = await mountTracks({
      selectedClipId: 'webcam-clip',
      selectedClipIds: selectedIds,
      selectedZoomId: null,
      selectedZoomIds: [],
    });

    await findClip(mounted, 'webcam-clip').trigger('contextmenu', { clientX: 200, clientY: 300 });
    await flushPromises();
    contextMenuButton('Delete')?.click();
    await flushPromises();

    expect(mounted!.emitted('select:item')).toBeUndefined();
    expect(mounted!.emitted('delete:selection')).toContainEqual([{ clipIds: selectedIds, zoomIds: [], mode: 'lift' }]);
  });
});
