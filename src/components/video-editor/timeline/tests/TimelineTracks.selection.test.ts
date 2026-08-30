import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { VisualClip } from '~/media/shared/composition-types';
import { composition, contextMenuButton, mountTracks, TimelineClipStub, visual } from './TimelineTracks.test-support';

const findClip = (mounted: Awaited<ReturnType<typeof mountTracks>>, id: string) => {
  const clip = mounted
    ?.findAllComponents(TimelineClipStub)
    .find((component) => (component.props('clip') as VisualClip).id === id);
  if (!clip) throw new Error(`Expected the ${id} timeline clip stub.`);
  return clip;
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
