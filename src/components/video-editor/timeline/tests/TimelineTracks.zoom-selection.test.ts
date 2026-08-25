import { describe, expect, it } from 'vitest';
import { mountTracks, zoom } from './TimelineTracks.test-support';

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
});
