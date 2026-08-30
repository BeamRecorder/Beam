import { describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import type { CaptionClip, ColorClip, VisualClip } from '~/media/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import {
  TimelineClipStub,
  asset,
  cameraTrackComposition,
  composition,
  importedAudio,
  keyboardCaption,
  mountTracks,
  pointerEvent,
  queueAnimationFrames,
  zoom,
  visual,
} from './TimelineTracks.test-support';

const ctrlWheelEvent = (deltaY: number, timeStamp?: number) => {
  const event = new WheelEvent('wheel', { ctrlKey: true, deltaY, bubbles: true, cancelable: true });
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { configurable: true, value: timeStamp });
  return event;
};

describe('TimelineTracks', () => {
  it('renders ordered visual/audio/caption tracks and scrubs, zooms, and selects them', async () => {
    const mounted = await mountTracks();
    expect(mounted!.findAll('.tracks-stack .visual-track')).toHaveLength(3);
    expect(mounted!.find('.ruler-export-progress-bar').attributes('style')).toContain('25%');
    expect(mounted!.find('.cursor-zoom-indicator').text()).toContain('5.00×');
    expect(mounted!.findAll('.tracks-stack > .audio-track')).toHaveLength(3);
    expect(mounted!.findAll('.tracks-stack > .audio-track')[1]!.classes()).toContain('disabled');

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 720));
    window.dispatchEvent(pointerEvent('pointerup', 820));
    expect(mounted!.emitted('update:currentTime')).toBeTruthy();

    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const { pendingFrames, flushAllFrames } = queueAnimationFrames();

    const emittedBeforeWheel = mounted!.emitted('update:zoomLevel')?.length ?? 0;
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: false, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')?.length ?? 0).toBe(emittedBeforeWheel);
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')?.length ?? 0).toBe(emittedBeforeWheel);
    expect(pendingFrames.size).toBe(1);
    flushAllFrames();
    expect(mounted!.emitted('update:zoomLevel')).toContainEqual([145]);

    await mounted!.setProps({ zoomLevel: 3_190 });
    flushAllFrames();
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')).toHaveLength(emittedBeforeWheel + 1);
    expect(pendingFrames.size).toBe(1);
    flushAllFrames();
    expect(mounted!.emitted('update:zoomLevel')).toContainEqual([3_200]);
    await mounted!.get('[data-track-id="image-track"] .track-info').trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      { clipIds: ['image-clip'], primaryClipId: 'image-clip', trackNames: ['Poster'] },
    ]);
    expect(mounted!.emitted('toggle:clip') ?? []).toHaveLength(0);

    expect(mounted!.find('.audio-track-actions').exists()).toBe(false);

    const clip = mounted!.findAll('.visual-track .timeline-clip')[2]!;
    await clip.trigger('click');
    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'clip', id: 'screen-clip', intent: 'replace' }]);
    await mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').trigger('click');
    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'zoom', id: 'zoom-1', intent: 'replace' }]);
  });

  it('passes layout width to clips when timeline UI scaling changes their visual width', async () => {
    const color = {
      ...visual({
        id: 'color-clip',
        name: 'Color layer',
        assetId: '',
        trackId: 'color-track',
        timelineStartMs: 4_000,
        timelineDurationMs: 1_000,
      }),
      kind: 'color',
      fill: { kind: 'color', color: '#111827' },
    } as ColorClip;
    const mounted = await mountTracks({ composition: { ...composition(), clips: [color] } });
    const ticks = mounted!.get('.ruler-ticks-area').element;
    vi.mocked(ticks.getBoundingClientRect).mockReturnValue({
      left: 120,
      top: 0,
      width: 750,
      height: 28,
      right: 870,
      bottom: 28,
    } as DOMRect);
    Object.defineProperty(ticks, 'offsetWidth', { configurable: true, value: 1_000 });
    Object.defineProperty(ticks, 'clientWidth', { configurable: true, value: 1_000 });
    mounted!.get('.timeline-tracks-container').element.dispatchEvent(new Event('scroll'));
    await flushPromises();

    const colorClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === color.id);
    if (!colorClip) throw new Error('Expected the color timeline clip stub.');
    expect(colorClip.props('timelineWidthPx')).toBe(1_000);
    expect(colorClip.get('.timeline-clip').attributes('style')).toContain('translate3d(400px');
  });

  it('renders zoom metadata left-to-right around the persistent center Zoom label', async () => {
    const mounted = await mountTracks({
      zoomElements: [
        zoom({ projection: '2d', mode: 'manual' }),
        zoom({ id: 'zoom-2', startMs: 4_000, endMs: 5_500, projection: '3d', mode: 'auto', depth: 3 }),
      ],
      selectedZoomId: null,
    });

    const indicators = mounted!.findAll('.cursor-zoom-indicator:not(.preview-ghost)');
    expect(indicators).toHaveLength(2);

    expect(indicators[0]!.find('.zoom-clip-labels').findAll('.zoom-meta-badge')[0]!.text()).toBe('2D');
    expect(indicators[0]!.find('.zoom-title').text()).toBe('Zoom 5.00×');
    expect(indicators[0]!.find('.zoom-clip-labels').findAll('.zoom-meta-badge')[1]!.text()).toBe('Manual');
    expect(indicators[1]!.find('.zoom-clip-labels').findAll('.zoom-meta-badge')[0]!.text()).toBe('3D');
    expect(indicators[1]!.find('.zoom-title').text()).toBe('Zoom 1.80×');
    expect(indicators[1]!.find('.zoom-clip-labels').findAll('.zoom-meta-badge')[1]!.text()).toBe('Auto');

    for (const indicator of indicators) {
      expect(indicator.find('.zoom-clip-labels').classes()).toContain('zoom-clip-labels');
      expect(indicator.find('.zoom-projection-badge').classes()).toContain('zoom-meta-badge');
      expect(indicator.find('.zoom-mode-badge').classes()).toContain('zoom-meta-badge');
      expect(indicator.find('.zoom-title').exists()).toBe(true);
    }
  });

  it('coalesces a large fresh ctrl-wheel burst into one zoom step and emission', async () => {
    const mounted = await mountTracks();
    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const { pendingFrames, flushAllFrames } = queueAnimationFrames();

    for (let event = 0; event < 40; event += 1) tracksContainer.dispatchEvent(ctrlWheelEvent(-100));

    expect(pendingFrames.size).toBe(1);
    expect(mounted!.emitted('update:zoomLevel')).toBeUndefined();

    flushAllFrames();

    expect(mounted!.emitted('update:zoomLevel')).toEqual([[145]]);
  });

  it('keeps the dominant direction for mixed wheel deltas in one frame', async () => {
    const mounted = await mountTracks();
    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const { pendingFrames, flushAllFrames } = queueAnimationFrames();

    tracksContainer.dispatchEvent(ctrlWheelEvent(-100));
    tracksContainer.dispatchEvent(ctrlWheelEvent(-100));
    tracksContainer.dispatchEvent(ctrlWheelEvent(-100));
    tracksContainer.dispatchEvent(ctrlWheelEvent(1));

    expect(pendingFrames.size).toBe(1);
    flushAllFrames();

    expect(mounted!.emitted('update:zoomLevel')).toEqual([[145]]);
  });

  it('uses the last requested zoom across consecutive frames before prop synchronization', async () => {
    const mounted = await mountTracks();
    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();

    tracksContainer.dispatchEvent(ctrlWheelEvent(-100));
    expect(pendingFrames.size).toBe(1);
    flushNextFrame();
    expect(mounted!.emitted('update:zoomLevel')).toEqual([[145]]);

    tracksContainer.dispatchEvent(ctrlWheelEvent(-100));
    expect(pendingFrames.size).toBe(1);
    flushNextFrame();

    expect(mounted!.emitted('update:zoomLevel')).toEqual([[145], [170]]);
  });

  it('ignores a stale ctrl-wheel event without scheduling a zoom frame', async () => {
    const mounted = await mountTracks();
    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const { pendingFrames, flushAllFrames } = queueAnimationFrames();

    tracksContainer.dispatchEvent(ctrlWheelEvent(-100, performance.now() - 1_000));

    expect(pendingFrames.size).toBe(0);
    expect(mounted!.emitted('update:zoomLevel')).toBeUndefined();
    flushAllFrames();
    expect(mounted!.emitted('update:zoomLevel')).toBeUndefined();
  });

  it('cancels a pending zoom frame on unmount', async () => {
    const mounted = await mountTracks();
    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const { pendingFrames, flushAllFrames } = queueAnimationFrames();

    tracksContainer.dispatchEvent(ctrlWheelEvent(-100));
    expect(pendingFrames.size).toBe(1);

    mounted!.unmount();
    expect(pendingFrames.size).toBe(0);

    flushAllFrames();
    expect(mounted!.emitted('update:zoomLevel')).toBeUndefined();
  });

  it('renders contiguous imported audio fragments from one asset in a single lane', async () => {
    const base = composition();
    const mounted = await mountTracks({
      composition: {
        ...base,
        clips: [
          ...base.clips.filter((clip) => clip.id !== 'imported-audio'),
          importedAudio({ id: 'audio-left', timelineStartMs: 0, sourceDurationMs: 2_000 }),
          importedAudio({ id: 'audio-right', timelineStartMs: 2_000, sourceInMs: 2_000, sourceDurationMs: 2_000 }),
        ],
      },
    });

    const importedRows = mounted!
      .findAll('.tracks-stack > .audio-track')
      .filter((row) => row.findAll('.timeline-clip').some((clip) => clip.text().includes('Imported audio')));
    expect(importedRows).toHaveLength(1);
    expect(importedRows[0]!.findAll('.timeline-clip')).toHaveLength(2);
  });

  it('keeps imported audio clips from different assets on separate lanes', async () => {
    const base = composition();
    const mounted = await mountTracks({
      composition: {
        ...base,
        assets: [...base.assets, asset('imported-asset-2', 'audio')],
        clips: [
          ...base.clips.filter((clip) => clip.id !== 'imported-audio'),
          importedAudio({ id: 'audio-one', assetId: 'imported-asset' }),
          importedAudio({ id: 'audio-two', assetId: 'imported-asset-2' }),
        ],
      },
    });

    const importedRows = mounted!
      .findAll('.tracks-stack > .audio-track')
      .filter((row) => row.findAll('.timeline-clip').some((clip) => clip.text().includes('Imported audio')));
    expect(importedRows).toHaveLength(2);
    expect(importedRows.every((row) => row.findAll('.timeline-clip').length === 1)).toBe(true);
  });

  it('only renders the Canvas transition track when at least one global transition exists', async () => {
    const mounted = await mountTracks();
    expect(mounted!.find('.canvas-sidebar-row').exists()).toBe(false);
    expect(mounted!.find('.canvas-track-row').exists()).toBe(false);
  });

  it('renders both Canvas transition edges and opens the corresponding edge from the timeline', async () => {
    const mounted = await mountTracks({
      canvas: {
        ...DEFAULT_OUTPUT_CANVAS,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      },
    });

    expect(mounted!.find('.canvas-sidebar-row').exists()).toBe(true);
    expect(mounted!.findAll('.canvas-transition-zone')).toHaveLength(2);
    expect(mounted!.get('.canvas-transition-zone.entry').attributes('aria-label')).toContain('fade');
    expect(mounted!.get('.canvas-transition-zone.exit').attributes('aria-label')).toContain('blur');

    await mounted!.get('.canvas-transition-zone.entry').trigger('click');
    await mounted!.get('.canvas-transition-zone.exit').trigger('click');
    expect(mounted!.emitted('open:canvas-transition')).toEqual([['entry'], ['exit']]);
  });

  it('relays an intermediate Canvas transition preview and commits only on pointerup', async () => {
    const mounted = await mountTracks({
      duration: 1,
      canvas: {
        ...DEFAULT_OUTPUT_CANVAS,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      },
    });
    const track = mounted!.get('.canvas-track-content').element;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 1_000,
      height: 40,
      right: 1_100,
      bottom: 40,
    } as DOMRect);

    mounted!
      .get('.canvas-transition-zone.entry .duration-handle.end')
      .element.dispatchEvent(pointerEvent('pointerdown', 300));
    window.dispatchEvent(pointerEvent('pointermove', 700));

    expect(mounted!.emitted('preview:canvas')?.[0]?.[0]).toEqual(
      expect.objectContaining({
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 600 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      }),
    );
    expect(mounted!.emitted('update:canvas')).toBeUndefined();

    window.dispatchEvent(pointerEvent('pointerup', 700));
    expect(mounted!.emitted('preview:canvas')).toContainEqual([null]);
    expect(mounted!.emitted('update:canvas')?.[0]?.[0]).toEqual(
      expect.objectContaining({
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 600 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      }),
    );
  });

  it('renders split segments from one track in one visual row while preserving separate tracks', async () => {
    const segmented = composition();
    segmented.clips = segmented.clips.flatMap((clip) => {
      if (clip.id !== 'screen-clip') return [clip];
      return [
        visual({
          ...(clip as VisualClip),
          id: 'screen-left',
          name: 'Main screen (left)',
          timelineDurationMs: 1_000,
          sourceDurationMs: 1_000,
          trackId: 'screen-track',
        }),
        visual({
          ...(clip as VisualClip),
          id: 'screen-right',
          name: 'Main screen (right)',
          timelineStartMs: 1_000,
          timelineDurationMs: 3_000,
          sourceInMs: 1_000,
          sourceDurationMs: 3_000,
          trackId: 'screen-track',
        }),
      ];
    });

    const mounted = await mountTracks({ composition: segmented });
    const rows = mounted!.findAll('.tracks-stack .visual-tracks-group > .visual-track');
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.findAll('.timeline-clip').length === 2)).toHaveLength(1);
    const segmentedRow = rows.find((row) => row.findAll('.timeline-clip').length === 2)!;
    expect(segmentedRow.text()).toContain('Main screen (left)');
    expect(segmentedRow.text()).toContain('Main screen (right)');
    expect(rows.filter((row) => row.findAll('.timeline-clip').length === 1)).toHaveLength(2);

    const sidebarRows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    expect(sidebarRows).toHaveLength(3);
    const screenHeader = sidebarRows.find((row) => row.attributes('data-track-id') === 'screen-track');
    if (!screenHeader) throw new Error('Expected the segmented screen track header.');
    await screenHeader.get('.track-info').trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      expect.objectContaining({
        clipIds: expect.arrayContaining(['screen-left', 'screen-right']),
        primaryClipId: 'screen-right',
      }),
    ]);
    expect(mounted!.emitted('toggle:clip') ?? []).toHaveLength(0);
  });

  it('selects every webcam segment and uses the segment nearest the playhead as primary', async () => {
    const mounted = await mountTracks({ composition: cameraTrackComposition(), currentTime: 1 });
    const cameraHeader = mounted!.get('[data-track-id="camera-track"] .track-info');

    await cameraHeader.trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      {
        clipIds: ['camera-left', 'camera-right'],
        primaryClipId: 'camera-left',
        trackNames: ['Webcam'],
      },
    ]);
    expect(mounted!.emitted('toggle:clip') ?? []).toHaveLength(0);

    await mounted!.setProps({ currentTime: 6.5 });
    await cameraHeader.trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      {
        clipIds: ['camera-right', 'camera-left'],
        primaryClipId: 'camera-right',
        trackNames: ['Webcam'],
      },
    ]);
  });

  it('selects the keyboard track and each independent text layer from their headers', async () => {
    const base = composition();
    const secondKeyboard = {
      ...keyboardCaption(),
      id: 'keyboard-caption-2',
      timelineStartMs: 7_000,
      sourceDurationMs: 1_000,
    } satisfies CaptionClip;
    const textCaption = base.clips.find((clip): clip is CaptionClip => clip.id === 'caption-clip');
    if (!textCaption) throw new Error('Expected the base text caption clip.');
    const secondText = {
      ...textCaption,
      id: 'caption-clip-2',
      timelineStartMs: 8_000,
      isAiGenerated: false,
      captionLayerId: undefined,
    } satisfies CaptionClip;
    const mounted = await mountTracks({
      composition: { ...base, clips: [...base.clips, keyboardCaption(), secondKeyboard, secondText] },
    });

    await mounted!.get('.sidebar-tracks-stack .keyboard-caption-track .track-info').trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      {
        clipIds: ['keyboard-caption', 'keyboard-caption-2'],
        primaryClipId: 'keyboard-caption',
        trackNames: ['Keyboard Captions'],
      },
    ]);

    await mounted!.get('.sidebar-tracks-stack .text-caption-track .track-info').trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      {
        clipIds: ['caption-clip'],
        primaryClipId: 'caption-clip',
        trackNames: ['Text Captions'],
      },
    ]);
    expect(mounted!.emitted('toggle:clip') ?? []).toHaveLength(0);
  });

  it('selects all clips in an audio header without toggling the track', async () => {
    const base = composition();
    const mounted = await mountTracks({
      composition: {
        ...base,
        clips: [
          ...base.clips.filter((clip) => clip.id !== 'imported-audio'),
          importedAudio({ id: 'audio-left', timelineStartMs: 0, sourceDurationMs: 2_000 }),
          importedAudio({ id: 'audio-right', timelineStartMs: 2_000, sourceInMs: 2_000, sourceDurationMs: 2_000 }),
        ],
      },
    });
    const importedHeader = mounted!
      .findAll('.sidebar-tracks-stack .audio-track')
      .find((row) => row.text().includes('Imported audio'));
    if (!importedHeader) throw new Error('Expected the imported audio header.');

    await importedHeader.get('.track-info').trigger('click');
    expect(mounted!.emitted('select:track')).toContainEqual([
      {
        clipIds: ['audio-left', 'audio-right'],
        primaryClipId: 'audio-left',
        trackNames: ['Imported audio'],
      },
    ]);
    expect(mounted!.emitted('toggle:clip') ?? []).toHaveLength(0);
  });

  it('keeps the keyboard track above text, uses Lucide icons, and reserves manual additions for text', async () => {
    const mounted = await mountTracks({ composition: composition([keyboardCaption()]) });
    const rows = mounted!.findAll('.tracks-stack .track-row');
    const keyboardIndex = rows.findIndex((row) => row.classes().includes('keyboard-caption-track'));
    const textIndex = rows.findIndex((row) => row.classes().includes('text-caption-track'));

    expect(keyboardIndex).toBeGreaterThanOrEqual(0);
    expect(keyboardIndex).toBeLessThan(textIndex);
    expect(mounted!.get('.keyboard-caption-track .track-icon').classes()).toEqual(
      expect.arrayContaining(['lucide', 'lucide-keyboard']),
    );
    expect(mounted!.get('.text-caption-track .track-icon').classes()).toEqual(
      expect.arrayContaining(['lucide', 'lucide-type']),
    );

    await mounted!.get('.keyboard-caption-track .track-content').trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption') ?? []).toHaveLength(0);
    await mounted!.get('.text-caption-track .track-content').trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption')).toContainEqual([{ startMs: 7_300, durationMs: 2_000 }]);
  });

  it('does not render a keyboard track when the composition has no keyboard caption', async () => {
    const mounted = await mountTracks();
    expect(mounted!.find('.keyboard-caption-track').exists()).toBe(false);
    expect(mounted!.find('.text-caption-track').exists()).toBe(true);
  });

  it('highlights every clip listed in selectedClipIds at the same time', async () => {
    const mounted = await mountTracks({
      selectedClipId: 'screen-clip',
      selectedClipIds: ['screen-clip', 'image-clip', 'caption-clip', 'system-audio'],
    });

    const clips = mounted!.findAllComponents(TimelineClipStub);
    expect(clips.find((clip) => clip.props('clip').id === 'screen-clip')?.props('selected')).toBe(true);
    expect(clips.find((clip) => clip.props('clip').id === 'image-clip')?.props('selected')).toBe(true);
    expect(clips.find((clip) => clip.props('clip').id === 'system-audio')?.props('selected')).toBe(true);
    expect(clips.find((clip) => clip.props('clip').id === 'webcam-clip')?.props('selected')).toBe(false);
    expect(mounted!.get('.text-caption-track .annotation-indicator:not(.preview-ghost)').classes()).toContain(
      'selected',
    );
  });

  it('forwards per-clip waveform slices, loading status, and real errors to TimelineClip', async () => {
    const mounted = await mountTracks();
    const clips = mounted!.findAllComponents(TimelineClipStub);
    const system = clips.find((component) => component.props('clip').id === 'system-audio');
    const microphone = clips.find((component) => component.props('clip').id === 'microphone-audio');
    const imported = clips.find((component) => component.props('clip').id === 'imported-audio');
    if (!system || !microphone || !imported) throw new Error('Expected all audio timeline clip stubs.');

    expect(system.props('waveformBars')).toEqual([4, 12, 20]);
    expect(system.props('waveformStatus')).toBe('ready');
    expect(system.props('waveformLeftPercent')).toBe(0);
    expect(system.props('waveformWidthPercent')).toBe(100);

    expect(microphone.props('waveformBars')).toBeUndefined();
    expect(microphone.props('waveformStatus')).toBe('loading');
    expect(microphone.props('waveformError')).toBeUndefined();

    expect(imported.props('waveformBars')).toBeUndefined();
    expect(imported.props('waveformStatus')).toBe('error');
    expect(imported.props('waveformError')).toEqual({
      kind: 'decode-failure',
      sourceId: 'imported-asset',
      message: 'The waveform could not be decoded.',
    });
  });

  it('highlights the recently pasted clip, zoom, and caption only for the matching item', async () => {
    const mounted = await mountTracks({
      recentPaste: { type: 'clip', id: 'screen-clip', timestamp: 1 },
    });
    const screen = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screen) throw new Error('Expected the screen timeline clip stub.');
    expect(screen.props('pasteHighlight')).toBe(true);
    expect(screen.get('.timeline-clip').classes()).toContain('paste-arrival');

    await mounted!.setProps({ recentPaste: { type: 'zoom', id: 'zoom-1', timestamp: 2 } });
    expect(screen.props('pasteHighlight')).toBe(false);
    expect(mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').classes()).toContain('paste-arrival');

    await mounted!.setProps({ recentPaste: { type: 'clip', id: 'caption-clip', timestamp: 3 } });
    expect(mounted!.get('.text-caption-track .annotation-indicator:not(.preview-ghost)').classes()).toContain(
      'paste-arrival',
    );
    expect(mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').classes()).not.toContain('paste-arrival');
  });
});
