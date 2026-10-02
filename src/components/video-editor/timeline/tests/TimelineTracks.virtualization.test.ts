import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { isReactive, markRaw, ref } from 'vue';
import { triggerPointer } from '../../../../../tests/support/pointer';
import TimelineSelectionBox from '../TimelineSelectionBox.vue';
import { composition, mountTracks, pointerEvent, visual } from './TimelineTracks.test-support';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { SelectionTarget } from '../composables/timeline-box-selection-types';

describe('two dimensional timeline virtualization', () => {
  it('retains one focused clip during scrolling and releases it when focus leaves the lane', async () => {
    const original = composition();
    original.clips = Array.from({ length: 100 }, (_, i) =>
      visual({
        id: `clip-${i}`,
        trackId: `lane-${i}`,
        order: i,
        groupId: undefined,
      }),
    );
    const mounted = await mountTracks({ composition: markRaw(original), zoomElements: [] });
    const clip = mounted!.get('[data-timeline-clip-id="clip-0"]').element;
    clip.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const scroll = mounted!.get('.timeline-tracks-container').element;
    scroll.scrollTop = 2500;
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    expect(mounted!.find('[data-timeline-clip-id="clip-0"]').exists()).toBe(true);
    clip.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    await flushPromises();
    expect(mounted!.find('[data-timeline-clip-id="clip-0"]').exists()).toBe(false);
  });
  it('mounts bounded aligned header and clip rows while scrolling 10000 lanes', async () => {
    const original = composition();
    original.clips = Array.from({ length: 10000 }, (_, i) =>
      visual({
        id: `clip-${i}`,
        trackId: `lane-${i}`,
        order: i,
        groupId: undefined,
      }),
    );
    const mounted = await mountTracks({
      composition: markRaw(original),
      zoomElements: [],
      duration: 60,
      selectedClipIds: original.clips.map((c) => c.id),
    });
    const scroll = mounted!.get('.timeline-tracks-container').element;
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 348 });
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    expect(mounted!.findAll('.timeline-selection-surface .visual-track').length).toBeLessThan(16);
    scroll.scrollTop = 160000;
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    const tracks = mounted!.findAll('.timeline-selection-surface .visual-track');
    expect(tracks.length).toBeLessThan(19);
    expect(mounted!.find('[data-timeline-clip-id="clip-0"]').exists()).toBe(false);
    for (const track of tracks) {
      const id = (track.element as HTMLElement).dataset.timelineRowId;
      const header = mounted!.get(`.sidebar-tracks-stack [data-timeline-row-id="${id}"]`);
      expect((header.element as HTMLElement).style.top).toBe((track.element as HTMLElement).style.top);
      expect((header.element as HTMLElement).style.height).toBe((track.element as HTMLElement).style.height);
    }
    const getTargets = mounted!.getComponent(TimelineSelectionBox).props('getTargets') as () => SelectionTarget[];
    const targets = getTargets();
    expect(targets).toHaveLength(10000);
    expect(targets.find((target) => target.id === 'clip-9999')!.y).toBeGreaterThan(319900);
  });
  it('mounts only the horizontal window of 10000 fragments in one lane and bounded ruler ticks', async () => {
    const original = composition();
    original.clips = Array.from({ length: 10000 }, (_, i) =>
      visual({
        id: `clip-${i}`,
        trackId: 'one-lane',
        order: 0,
        groupId: undefined,
        timelineStartMs: i * 60,
        timelineDurationMs: 40,
        sourceDurationMs: 40,
      }),
    );
    const mounted = await mountTracks(
      { composition: markRaw(original), zoomElements: [], duration: 600, zoomLevel: 60000 },
      600000,
    );
    const ticks = mounted!.get('.ruler-ticks-area').element;
    vi.mocked(ticks.getBoundingClientRect).mockReturnValue({
      left: 120,
      width: 600000,
      right: 600120,
      top: 0,
      bottom: 28,
      height: 28,
    } as DOMRect);
    Object.defineProperty(ticks, 'clientWidth', { configurable: true, value: 600000 });
    const scroll = mounted!.get('.timeline-tracks-container').element;
    scroll.scrollLeft = 300000;
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    expect(mounted!.findAll('[data-timeline-clip-id]').length).toBeLessThan(23);
    expect(mounted!.find('[data-timeline-clip-id="clip-5000"]').exists()).toBe(true);
    expect(mounted!.find('[data-timeline-clip-id="clip-0"]').exists()).toBe(false);
    expect(mounted!.findAll('.ruler-marker').length).toBeLessThan(10);
  });
  it('pins an active drag across vertical scrolling, emits shallow immutable previews, then unmounts it', async () => {
    const original = composition();
    original.clips = Array.from({ length: 100 }, (_, i) =>
      visual({
        id: `clip-${i}`,
        trackId: `lane-${i}`,
        order: i,
        groupId: undefined,
      }),
    );
    const mounted = await mountTracks({
      composition: markRaw(original),
      zoomElements: [],
      isSnappingEnabled: false,
      selectedClipIds: ['clip-0'],
    });
    const clip = mounted!.get('[data-timeline-clip-id="clip-0"]');
    await triggerPointer(clip, 'pointerdown', { button: 0, clientX: 200, clientY: 10 });
    const scroll = mounted!.get('.timeline-tracks-container').element;
    scroll.scrollTop = 2500;
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    expect(mounted!.find('[data-timeline-clip-id="clip-0"]').exists()).toBe(true);
    window.dispatchEvent(pointerEvent('pointermove', 250));
    await flushPromises();
    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition;
    expect(isReactive(ref(preview).value)).toBe(false);
    expect(preview.clips[1]).toBe(original.clips[1]);
    expect(original.clips[0]!.timelineStartMs).toBe(0);
    window.dispatchEvent(pointerEvent('pointercancel', 250));
    await flushPromises();
    expect(mounted!.find('[data-timeline-clip-id="clip-0"]').exists()).toBe(false);
    expect(mounted!.emitted('move:selection')).toBeUndefined();
  });
});
