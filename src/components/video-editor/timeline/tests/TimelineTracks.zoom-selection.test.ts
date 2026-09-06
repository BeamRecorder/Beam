import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { VisualClip } from '~/media/shared/composition-types';
import { composition, mountTracks, pointerEvent, TimelineClipStub, visual, zoom } from './TimelineTracks.test-support';

const largeMixedSelection = () => {
  const clips = Array.from({ length: 12 }, (_, index) =>
    visual({
      id: `zoom-selected-clip-${index + 1}`,
      name: `Zoom selected ${index + 1}`,
      trackId: `zoom-selected-track-${index + 1}`,
      timelineStartMs: 500 + index * 700,
      timelineDurationMs: 300,
      sourceDurationMs: 300,
      order: index,
    }),
  );
  const zooms = [
    zoom({ id: 'zoom-selected-1', startMs: 3_000, endMs: 4_000 }),
    zoom({ id: 'zoom-selected-2', startMs: 7_000, endMs: 8_000 }),
  ];
  return {
    clips,
    zooms,
    clipIds: clips.map((clip) => clip.id),
    zoomIds: zooms.map((zoom) => zoom.id),
    composition: { ...composition(), clips },
  };
};

const findClip = (mounted: Awaited<ReturnType<typeof mountTracks>>, id: string) => {
  const clip = mounted
    ?.findAllComponents(TimelineClipStub)
    .find((component) => (component.props('clip') as VisualClip).id === id);
  if (!clip) throw new Error(`Expected the ${id} timeline clip stub.`);
  return clip;
};

describe('TimelineTracks zoom header selection', () => {
  it('emits every zoom id with the zoom nearest the playhead as primary', async () => {
    const mounted = await mountTracks({
      currentTime: 2,
      zoomElements: [
        zoom({ id: 'zoom-earlier', startMs: 0, endMs: 1_000 }),
        zoom({ id: 'zoom-near', startMs: 2_500, endMs: 3_500 }),
        zoom({ id: 'zoom-later', startMs: 4_000, endMs: 5_000 }),
      ],
      selectedZoomId: null,
    });

    await mounted!.get('.sidebar-track-item.cursor-track .track-info').trigger('click');

    expect(mounted!.emitted('select:zoom-track')).toEqual([
      [
        {
          zoomIds: ['zoom-near', 'zoom-earlier', 'zoom-later'],
          primaryZoomId: 'zoom-near',
        },
      ],
    ]);
  });

  it('marks the zoom header selected only when every zoom is selected', async () => {
    const zoomElements = [
      zoom({ id: 'zoom-one', startMs: 0, endMs: 1_000 }),
      zoom({ id: 'zoom-two', startMs: 2_000, endMs: 3_000 }),
      zoom({ id: 'zoom-three', startMs: 4_000, endMs: 5_000 }),
    ];
    const mounted = await mountTracks({ zoomElements, selectedZoomIds: ['zoom-one', 'zoom-two'] });
    const header = mounted!.get('.sidebar-track-item.cursor-track');

    expect(header.classes()).not.toContain('selected');

    await mounted!.setProps({ selectedZoomIds: zoomElements.map(({ id }) => id) });
    expect(header.classes()).toContain('selected');

    await mounted!.setProps({ selectedZoomIds: [] });
    expect(header.classes()).not.toContain('selected');
  });

  it('uses the same all-selected state for visual, caption, and audio headers', async () => {
    const mounted = await mountTracks({
      selectedClipIds: ['screen-clip', 'webcam-clip', 'image-clip', 'caption-clip', 'system-audio'],
      selectedZoomIds: ['zoom-1'],
    });

    const visualHeaders = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    const captionHeader = mounted!.find('.sidebar-tracks-stack .text-caption-track');
    const audioHeader = mounted!
      .findAll('.sidebar-tracks-stack .audio-track')
      .find((row) => row.text().includes('System'));

    expect(visualHeaders).toHaveLength(3);
    expect(visualHeaders.every((header) => header.classes().includes('selected'))).toBe(true);
    expect(captionHeader.classes()).toContain('selected');
    expect(audioHeader?.classes()).toContain('selected');

    await mounted!.setProps({ selectedClipIds: ['screen-clip', 'webcam-clip', 'caption-clip'] });
    const visualByTrackId = new Map(visualHeaders.map((header) => [header.attributes('data-track-id'), header]));
    expect(visualByTrackId.get('screen-track')?.classes()).toContain('selected');
    expect(visualByTrackId.get('webcam-track')?.classes()).toContain('selected');
    expect(visualByTrackId.get('image-track')?.classes()).not.toContain('selected');
    expect(captionHeader.classes()).toContain('selected');
    expect(audioHeader?.classes()).not.toContain('selected');
  });

  it('moves every selected clip and zoom from a zoom anchor and cancels cleanly', async () => {
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
    const zoomButton = mounted!.get(`[data-timeline-zoom-id="${fixture.zoomIds[0]}"]`);
    const initialZoomStyle = zoomButton.element as HTMLElement;
    expect(initialZoomStyle.style.left).toMatch(/^0(?:px)?$/);
    expect(initialZoomStyle.style.transform).toBe('translate3d(250px, 0, 0)');
    expect(initialZoomStyle.style.left).not.toContain('%');
    const initialWidth = initialZoomStyle.style.width;

    await zoomButton.trigger('pointerdown', { button: 0, pointerId: 61, clientX: 200 });
    await flushPromises();
    expect(mounted!.get('.timeline-viewport').classes()).toContain('is-moving');
    for (const clipId of fixture.clipIds) {
      expect(findClip(mounted, clipId).props('deferThumbnailRequests')).toBe(true);
    }

    window.dispatchEvent(pointerEvent('pointermove', 300));
    await flushPromises();

    const deltaMs = 1_200;
    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as typeof fixture.composition | undefined;
    const zoomPreview = mounted!.emitted('preview:zooms')?.at(-1)?.[0] as typeof fixture.zooms | undefined;
    expect(preview).toBeDefined();
    expect(zoomPreview).toBeDefined();
    expect(mounted!.emitted('preview:composition')).toHaveLength(1);
    expect(mounted!.emitted('preview:zooms')).toHaveLength(1);
    for (const clip of fixture.clips) {
      expect(preview?.clips.find((entry) => entry.id === clip.id)).toMatchObject({
        timelineStartMs: clip.timelineStartMs + deltaMs,
        timelineDurationMs: clip.timelineDurationMs,
      });
    }
    for (const zoom of fixture.zooms) {
      expect(zoomPreview?.find((entry) => entry.id === zoom.id)).toMatchObject({
        startMs: zoom.startMs + deltaMs,
        endMs: zoom.endMs + deltaMs,
      });
    }
    expect((zoomButton.element as HTMLElement).style.transform).toBe('translate3d(350px, 0, 0)');
    expect((zoomButton.element as HTMLElement).style.width).toBe(initialWidth);
    expect(fixture.composition.clips.map((clip) => clip.timelineStartMs)).toEqual(
      fixture.clips.map((clip) => clip.timelineStartMs),
    );
    expect(fixture.zooms.map((zoom) => zoom.startMs)).toEqual([3_000, 7_000]);
    expect(mounted!.emitted('move:selection')).toBeUndefined();

    window.dispatchEvent(pointerEvent('pointercancel', 300));
    await flushPromises();
    expect(mounted!.emitted('move:selection')).toBeUndefined();
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect(mounted!.emitted('preview:zooms')?.at(-1)).toEqual([null]);
    expect(mounted!.get('.timeline-viewport').classes()).not.toContain('is-moving');
    expect((zoomButton.element as HTMLElement).style.transform).toBe('translate3d(250px, 0, 0)');
    for (const clipId of fixture.clipIds) {
      expect(findClip(mounted, clipId).props('deferThumbnailRequests')).toBe(false);
    }
  });
});

describe('recording zoom links during dragging', () => {
  it.each([undefined, null])('moves an implicit zoom only while linked (%s)', async (linkedClipId) => {
    const screen = visual({
      id: 'screen-clip',
      kind: 'screen',
      timelineStartMs: 1000,
      timelineDurationMs: 4000,
      sourceDurationMs: 4000,
    });
    const base = composition();
    const comp = { ...base, clips: [screen], assets: base.assets.map((asset) => ({ ...asset, sessionId: 'session' })) };
    const element = zoom({ id: 'automatic', mode: 'auto', startMs: 2000, endMs: 3000, linkedClipId });
    const mounted = await mountTracks({
      composition: comp,
      duration: 10,
      zoomElements: [element],
      selectedClipIds: [screen.id],
      selectedClipId: screen.id,
      selectedZoomIds: [],
      selectedZoomId: null,
      isSnappingEnabled: false,
    });
    mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
    await flushPromises();
    await findClip(mounted, screen.id).trigger('pointerdown', { button: 0, pointerId: 1, clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 300));
    await flushPromises();
    const preview = mounted!.emitted('preview:zooms')?.at(-1)?.[0] as ReturnType<typeof zoom>[];
    expect(preview.find((item) => item.id === element.id)?.startMs).toBe(linkedClipId === null ? 2000 : 3000);
    window.dispatchEvent(pointerEvent('pointerup', 300));
    await flushPromises();
    if (linkedClipId === null) expect(mounted!.emitted('move:clip')).toEqual([[{ id: screen.id, startMs: 2000 }]]);
    else
      expect(mounted!.emitted('move:selection')).toEqual([
        [{ clipIds: [screen.id], zoomIds: [element.id], deltaMs: 1000 }],
      ]);
  });
});

it('drags a screen with its offset microphone even without any selected zooms', async () => {
  const base = composition();
  const screen = visual({
    id: 'screen-clip',
    kind: 'screen',
    timelineStartMs: 1000,
    timelineDurationMs: 4000,
    sourceDurationMs: 4000,
  });
  const mic = {
    ...base.clips.find((clip) => clip.id === 'microphone-audio')!,
    timelineStartMs: 1200,
    timelineDurationMs: 3000,
    sourceDurationMs: 3000,
    groupId: undefined,
  };
  const mounted = await mountTracks({
    composition: {
      ...base,
      assets: base.assets.map((asset) => ({ ...asset, sessionId: 'session' })),
      clips: [screen, mic],
    },
    duration: 10,
    zoomElements: [],
    selectedClipIds: [screen.id],
    selectedClipId: screen.id,
    selectedZoomIds: [],
    selectedZoomId: null,
    isSnappingEnabled: false,
  });
  mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
  await flushPromises();
  await findClip(mounted, screen.id).trigger('pointerdown', { button: 0, pointerId: 1, clientX: 200 });
  window.dispatchEvent(pointerEvent('pointermove', 300));
  await flushPromises();
  const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as typeof base;
  expect(preview.clips.find((clip) => clip.id === mic.id)).toMatchObject({
    timelineStartMs: 2200,
    timelineDurationMs: 3000,
  });
  window.dispatchEvent(pointerEvent('pointerup', 300));
  await flushPromises();
  expect(mounted!.emitted('move:selection')).toEqual([[{ clipIds: [screen.id, mic.id], zoomIds: [], deltaMs: 1000 }]]);
  expect(mounted!.emitted('move:clip')).toBeUndefined();
});
