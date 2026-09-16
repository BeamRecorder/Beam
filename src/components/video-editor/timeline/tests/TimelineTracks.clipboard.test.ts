import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { useTimelineClipboard } from '../composables/useTimelineClipboard';
import {
  composition,
  contextMenuButton,
  mountTracks,
  pointerEvent,
  queueAnimationFrames,
} from './TimelineTracks.test-support';

describe('TimelineTracks', () => {
  it('reorders visual clips and cancels a reorder without changing the composition', async () => {
    const mounted = await mountTracks();
    const rows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(rows[2]!.element),
    });
    await rows[0]!.get('.track-drag-handle').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 100));
    window.dispatchEvent(pointerEvent('pointerup', 30, 100));
    expect(mounted!.emitted('reorder:clip')).toContainEqual([{ id: 'image-clip', targetIndex: 2 }]);

    await rows[1]!.get('.track-drag-handle').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointercancel', 10, 10));
    expect(mounted!.emitted('reorder:clip')).toHaveLength(1);
    await mounted!.findAll('.sidebar-tracks-stack .audio-track')[1]!.get('.track-info').trigger('click');
  });

  it('marks every audio timeline row when audio is excluded from export', async () => {
    const mounted = await mountTracks({ includeAudioInExport: false });
    const indicators = mounted!.findAll('.export-audio-disabled');
    const sidebarStatuses = mounted!.findAll('.export-disabled-status');

    expect(indicators).toHaveLength(3);
    expect(indicators.every((indicator) => indicator.text() === 'Audio disabled from export')).toBe(true);
    expect(sidebarStatuses).toHaveLength(3);
    expect(mounted!.findAll('.audio-track.disabled')).toHaveLength(6);

    await mounted!.setProps({ includeAudioInExport: true });
    expect(mounted!.find('.export-audio-disabled').exists()).toBe(false);
    expect(mounted!.find('.export-disabled-status').exists()).toBe(false);
  });

  it('reorders visual tracks when dragging directly anywhere on the sidebar track-info button', async () => {
    const mounted = await mountTracks();
    const rows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(rows[1]!.element),
    });
    // Drag on the .track-info button directly without aiming at grip
    await rows[0]!.get('.track-info').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 80));
    window.dispatchEvent(pointerEvent('pointerup', 30, 80));
    expect(mounted!.emitted('reorder:clip')).toContainEqual([{ id: 'image-clip', targetIndex: 1 }]);
  });

  it('reorders visual tracks when moving a visual clip vertically across tracks in the timeline', async () => {
    const mounted = await mountTracks();
    const timelineRows = mounted!.findAll('.tracks-stack .visual-track');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(timelineRows[1]!.element),
    });
    const clipEl = timelineRows[0]!.get('.timeline-clip');
    await clipEl.trigger('pointerdown', { clientX: 50, clientY: 50 });
    window.dispatchEvent(pointerEvent('pointermove', 50, 120));
    window.dispatchEvent(pointerEvent('pointerup', 50, 120));
    expect(mounted!.emitted('reorder:clip')).toContainEqual([{ id: 'image-clip', targetIndex: 1 }]);
  });

  it('does not cross a locked visual lane while reordering tracks', async () => {
    const lockedComposition = composition();
    lockedComposition.clips = lockedComposition.clips.map((clip) =>
      clip.id === 'webcam-clip' ? { ...clip, locked: true } : clip,
    );
    const mounted = await mountTracks({ composition: lockedComposition });
    const rows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    expect(rows).toHaveLength(3);

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(rows[1]!.element),
    });
    await rows[0]!.get('.track-drag-handle').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 80));
    window.dispatchEvent(pointerEvent('pointerup', 30, 80));

    expect(mounted!.emitted('reorder:clip') ?? []).toHaveLength(0);
  });

  it('opens context menu on right click, pastes at the playhead, and handles delete', async () => {
    const mounted = await mountTracks();
    const clipEl = mounted!.find('.tracks-stack .timeline-clip');
    expect(clipEl.exists()).toBe(true);

    await clipEl.trigger('contextmenu', { clientX: 200, clientY: 300 });
    await flushPromises();

    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'clip', id: 'image-clip', intent: 'replace' }]);

    const menuItems = document.body.querySelectorAll('.context-menu-item');
    expect(menuItems.length).toBeGreaterThanOrEqual(3);
    const itemTexts = Array.from(menuItems).map((el) => el.textContent?.trim());
    expect(itemTexts.some((text) => text?.includes('Copy'))).toBe(true);
    expect(itemTexts.some((text) => text?.includes('Paste'))).toBe(true);
    expect(itemTexts.some((text) => text?.includes('Delete'))).toBe(true);

    expect(contextMenuButton('Paste')?.disabled).toBe(true);

    contextMenuButton('Copy')?.click();
    await flushPromises();
    expect(mounted!.emitted('clipboard:copied')).toHaveLength(1);

    const cursorTrack = mounted!.find('.tracks-stack .cursor-track');
    await cursorTrack.trigger('contextmenu', { clientX: 999, clientY: 350 });
    await flushPromises();

    const pasteBtn = contextMenuButton('Paste');
    expect(pasteBtn?.disabled).toBe(false);
    pasteBtn?.click();
    await flushPromises();

    const pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      | { item: { type: string; clip?: { id: string } }; timeMs: number; target?: { category: string } }
      | undefined;
    expect(pastePayload?.timeMs).toBe(2_000);
    expect(pastePayload?.item).toEqual(expect.objectContaining({ type: 'clip' }));
    expect(pastePayload?.item.clip?.id).toBe('image-clip');
    expect(pastePayload?.target?.category).toBe('zoom');

    await clipEl.trigger('contextmenu', { clientX: 250, clientY: 350 });
    await flushPromises();
    contextMenuButton('Delete')?.click();
    await flushPromises();

    expect(mounted!.emitted('delete:selection')).toContainEqual([
      { clipIds: ['image-clip'], zoomIds: [], mode: 'lift' },
    ]);
  });

  it('highlights and deletes the current selection when right-clicking a timeline gap', async () => {
    const mounted = await mountTracks({
      selectedZoomId: null,
      selectedClipId: 'screen-clip',
      selectedClipIds: ['screen-clip'],
    });

    const emptyTrackArea = mounted!.find('.tracks-stack .cursor-track');
    await emptyTrackArea.trigger('contextmenu', { clientX: 400, clientY: 350 });
    await flushPromises();

    const deleteButton = contextMenuButton('Delete');
    expect(deleteButton?.disabled).toBe(false);
    expect(deleteButton?.classList.contains('is-danger')).toBe(true);
    deleteButton?.click();
    await flushPromises();

    expect(mounted!.emitted('delete:selection')).toContainEqual([
      { clipIds: ['screen-clip'], zoomIds: [], mode: 'lift' },
    ]);
    expect(mounted!.emitted('select:item')).toBeUndefined();
  });

  it('allows cross-category pasting from the context menu', async () => {
    const mounted = await mountTracks();
    const clipEl = mounted!.find('.tracks-stack .timeline-clip');
    const zoomButton = mounted!.find('.cursor-zoom-indicator:not(.preview-ghost)');

    expect(zoomButton.exists()).toBe(true);

    await clipEl.trigger('contextmenu', { clientX: 100, clientY: 100 });
    await flushPromises();
    contextMenuButton('Copy')?.click();
    await flushPromises();
    await mounted!.setProps({
      selectedClipId: 'image-clip',
      selectedClipIds: ['image-clip'],
      selectedZoomId: null,
      selectedZoomIds: [],
    });

    const captionTrack = mounted!.find('.tracks-stack .text-caption-track');
    await captionTrack.trigger('contextmenu', { clientX: 300, clientY: 300 });
    await flushPromises();
    let pasteBtn = contextMenuButton('Paste');
    expect(pasteBtn?.disabled).toBe(false);
    pasteBtn?.click();
    await flushPromises();
    let pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      | { item: { type: string }; target?: { category: string } }
      | undefined;
    expect(pastePayload?.item.type).toBe('clip');
    expect(pastePayload?.target?.category).toBe('caption');

    await zoomButton.trigger('contextmenu', { clientX: 150, clientY: 150 });
    await flushPromises();
    expect(mounted!.emitted('select:item')).toContainEqual([{ kind: 'zoom', id: 'zoom-1', intent: 'replace' }]);

    contextMenuButton('Copy')?.click();
    await flushPromises();

    const visualTrack = mounted!.find('.tracks-stack .visual-track[data-track-id="screen-track"]');
    await visualTrack.trigger('contextmenu', { clientX: 100, clientY: 100 });
    await flushPromises();
    pasteBtn = contextMenuButton('Paste');
    expect(pasteBtn?.disabled).toBe(false);
    pasteBtn?.click();
    await flushPromises();
    pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      | { item: { type: string }; target?: { category: string; trackId?: string | null } }
      | undefined;
    expect(pastePayload?.item.type).toBe('zoom');
    expect(pastePayload?.target).toEqual({ category: 'visual', trackId: 'screen-track' });

    await zoomButton.trigger('contextmenu', { clientX: 150, clientY: 150 });
    await flushPromises();
    contextMenuButton('Delete')?.click();
    await flushPromises();

    expect(mounted!.emitted('delete:selection')).toContainEqual([{ clipIds: [], zoomIds: ['zoom-1'], mode: 'lift' }]);
  });

  it('copies, cuts, and pastes the mixed selection on Ctrl/Cmd, using a new layer for keyboard paste', async () => {
    const mounted = await mountTracks({
      selectedZoomId: 'zoom-1',
      selectedZoomIds: ['zoom-1'],
      selectedClipId: 'screen-clip',
      selectedClipIds: ['screen-clip', 'image-clip'],
    });
    const dispatchShortcut = (key: string, modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey'>) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      window.dispatchEvent(event);
      return event;
    };

    expect(dispatchShortcut('c', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(dispatchShortcut('c', { metaKey: true }).defaultPrevented).toBe(true);
    expect(mounted!.emitted('clipboard:copied')).toHaveLength(2);

    const copied = mounted!.emitted('clipboard:copied')?.at(-1)?.[0] as
      | { type: string; scopeId: string; anchorTimeMs?: number; primaryIndex?: number; entries?: unknown[] }
      | undefined;
    expect(copied).toMatchObject({
      type: 'selection',
      scopeId: 'project-a',
      anchorTimeMs: 0,
      primaryIndex: 2,
      entries: expect.arrayContaining([
        expect.objectContaining({ type: 'clip', clip: expect.objectContaining({ id: 'screen-clip' }) }),
        expect.objectContaining({ type: 'clip', clip: expect.objectContaining({ id: 'image-clip' }) }),
        expect.objectContaining({ type: 'zoom', zoom: expect.objectContaining({ id: 'zoom-1' }) }),
      ]),
    });

    await mounted!.setProps({ currentTime: 6 });
    expect(dispatchShortcut('v', { metaKey: true }).defaultPrevented).toBe(true);
    await flushPromises();

    const pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      | {
          item: { type: string };
          timeMs: number;
          target?: { category: string; trackId?: string | null; placement?: string };
        }
      | undefined;
    expect(pastePayload?.timeMs).toBe(6_000);
    expect(pastePayload?.item.type).toBe('selection');
    expect(pastePayload?.target).toEqual({
      category: 'visual',
      trackId: 'screen-track',
      placement: 'new-layer',
    });

    expect(dispatchShortcut('v', { ctrlKey: true }).defaultPrevented).toBe(true);
    await flushPromises();
    const ctrlPastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      | { item: { type: string }; timeMs: number; target?: { category: string; placement?: string } }
      | undefined;
    expect(mounted!.emitted('paste:item')).toHaveLength(2);
    expect(ctrlPastePayload).toMatchObject({
      timeMs: 6_000,
      item: { type: 'selection' },
      target: { category: 'visual', placement: 'new-layer' },
    });

    expect(dispatchShortcut('x', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(dispatchShortcut('x', { metaKey: true }).defaultPrevented).toBe(true);
    expect(mounted!.emitted('delete:selection')).toEqual([
      [{ clipIds: ['screen-clip', 'image-clip'], zoomIds: ['zoom-1'], mode: 'lift' }],
      [{ clipIds: ['screen-clip', 'image-clip'], zoomIds: ['zoom-1'], mode: 'lift' }],
    ]);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const copiesBeforeEditableShortcuts = mounted!.emitted('clipboard:copied')?.length ?? 0;
    const pastesBeforeEditableShortcuts = mounted!.emitted('paste:item')?.length ?? 0;
    const deletesBeforeEditableShortcuts = mounted!.emitted('delete:selection')?.length ?? 0;
    expect(dispatchShortcut('c', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(dispatchShortcut('x', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(dispatchShortcut('v', { ctrlKey: true }).defaultPrevented).toBe(false);
    await flushPromises();
    expect(mounted!.emitted('clipboard:copied')?.length ?? 0).toBe(copiesBeforeEditableShortcuts);
    expect(mounted!.emitted('paste:item')?.length ?? 0).toBe(pastesBeforeEditableShortcuts);
    expect(mounted!.emitted('delete:selection')?.length ?? 0).toBe(deletesBeforeEditableShortcuts);
    input.remove();

    useTimelineClipboard().clearClipboard();
    expect(dispatchShortcut('v', { ctrlKey: true }).defaultPrevented).toBe(true);
    await flushPromises();
    expect(mounted!.emitted('paste:error')).toContainEqual(['Copy a timeline item before pasting.']);
    expect(mounted!.emitted('paste:item')?.length ?? 0).toBe(pastesBeforeEditableShortcuts);
  });

  it('does not cut or replace the clipboard for a locked selection', async () => {
    const lockedComposition = composition();
    lockedComposition.clips = lockedComposition.clips.map((clip) =>
      clip.id === 'image-clip' ? { ...clip, locked: true } : clip,
    );
    const mounted = await mountTracks({
      composition: lockedComposition,
      selectedClipId: 'image-clip',
      selectedClipIds: ['image-clip'],
      selectedZoomId: null,
      selectedZoomIds: [],
    });
    const clipboard = useTimelineClipboard();
    const previousItem = clipboard.copyClip(
      'project-a',
      lockedComposition.clips.find((clip) => clip.id === 'screen-clip')!,
    );
    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true });

    window.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(false);
    expect(mounted!.emitted('delete:selection')).toBeUndefined();
    expect(mounted!.emitted('clipboard:copied')).toBeUndefined();
    expect(clipboard.getClipboardItem()).toEqual(previousItem);
  });

  it('ignores Ctrl/Cmd copy, cut, and paste shortcuts while controls are locked', async () => {
    const comp = composition();
    const clipboard = useTimelineClipboard();
    const previousItem = clipboard.copyClip(
      'project-a',
      comp.clips.find((clip) => clip.id === 'webcam-clip')!,
    );
    const mounted = await mountTracks({
      controlsLocked: true,
      composition: comp,
      selectedZoomId: 'zoom-1',
      selectedZoomIds: ['zoom-1'],
      selectedClipId: 'screen-clip',
      selectedClipIds: ['screen-clip', 'image-clip'],
    });
    const events = ['c', 'x', 'v'].flatMap((key) => [
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: true }),
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, metaKey: true }),
    ]);

    events.forEach((event) => window.dispatchEvent(event));
    await flushPromises();

    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
    expect(mounted!.emitted('clipboard:copied')).toBeUndefined();
    expect(mounted!.emitted('delete:selection')).toBeUndefined();
    expect(mounted!.emitted('paste:item')).toBeUndefined();
    expect(mounted!.emitted('paste:error')).toBeUndefined();
    expect(clipboard.getClipboardItem()).toEqual(previousItem);
  });

  it.each([
    ['repeated keydown', { repeat: true }],
    ['IME composition', { isComposing: true }],
    ['Alt modifier', { altKey: true }],
    ['Shift modifier', { shiftKey: true }],
  ] as Array<[string, Pick<KeyboardEventInit, 'repeat' | 'isComposing' | 'altKey' | 'shiftKey'>]>)(
    'ignores copy, cut, and paste during %s',
    async (_label, guard) => {
      const mounted = await mountTracks({ selectedZoomId: null });
      const clipboard = useTimelineClipboard();
      const events = ['c', 'x', 'v'].map(
        (key) =>
          new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            ...guard,
          }),
      );

      events.forEach((event) => window.dispatchEvent(event));
      await flushPromises();

      expect(events.every((event) => !event.defaultPrevented)).toBe(true);
      expect(mounted!.emitted('clipboard:copied')).toBeUndefined();
      expect(mounted!.emitted('delete:selection')).toBeUndefined();
      expect(mounted!.emitted('paste:item')).toBeUndefined();
      expect(mounted!.emitted('paste:error')).toBeUndefined();
      expect(clipboard.getClipboardItem()).toBeNull();
    },
  );

  it('ignores keyboard shortcuts already prevented by another handler', async () => {
    const mounted = await mountTracks({ selectedZoomId: null });
    const clipboard = useTimelineClipboard();
    const events = ['c', 'x', 'v'].map((key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: true });
      event.preventDefault();
      window.dispatchEvent(event);
      return event;
    });

    await flushPromises();

    expect(events.every((event) => event.defaultPrevented)).toBe(true);
    expect(mounted!.emitted('clipboard:copied')).toBeUndefined();
    expect(mounted!.emitted('delete:selection')).toBeUndefined();
    expect(mounted!.emitted('paste:item')).toBeUndefined();
    expect(clipboard.getClipboardItem()).toBeNull();
  });

  it('ignores keyboard shortcuts from a nested contenteditable element', async () => {
    const mounted = await mountTracks({ selectedZoomId: null });
    const clipboard = useTimelineClipboard();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const nested = document.createElement('span');
    editor.appendChild(nested);
    document.body.appendChild(editor);
    try {
      const events = ['c', 'x', 'v'].map((key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: true });
        nested.dispatchEvent(event);
        return event;
      });

      await flushPromises();

      expect(events.every((event) => !event.defaultPrevented)).toBe(true);
      expect(mounted!.emitted('clipboard:copied')).toBeUndefined();
      expect(mounted!.emitted('delete:selection')).toBeUndefined();
      expect(mounted!.emitted('paste:item')).toBeUndefined();
      expect(clipboard.getClipboardItem()).toBeNull();
    } finally {
      editor.remove();
    }
  });

  it('ignores keyboard shortcuts while an aria-modal dialog is open', async () => {
    const mounted = await mountTracks({ selectedZoomId: null });
    const clipboard = useTimelineClipboard();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    try {
      const events = ['c', 'x', 'v'].map((key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: true });
        window.dispatchEvent(event);
        return event;
      });

      await flushPromises();

      expect(events.every((event) => !event.defaultPrevented)).toBe(true);
      expect(mounted!.emitted('clipboard:copied')).toBeUndefined();
      expect(mounted!.emitted('delete:selection')).toBeUndefined();
      expect(mounted!.emitted('paste:item')).toBeUndefined();
      expect(clipboard.getClipboardItem()).toBeNull();
    } finally {
      dialog.remove();
    }
  });

  it('displays real-time caption text and triggers the settling animation on edit', async () => {
    const initialComp = composition();
    const targetCaption = initialComp.clips.find((c) => c.id === 'caption-clip') as CaptionClip;
    targetCaption.caption = {
      type: 'text',
      sentences: [{ id: 's1', text: 'Live transcribed subtitle', startMs: 1_000, endMs: 4_000, words: [] }],
      style: createDefaultCaptionStyle(),
    };

    const mounted = await mountTracks({
      composition: initialComp,
    });
    // Keep the shared throbber clock deterministic: the suite's default RAF
    // mock runs callbacks in microtasks, while the throbber intentionally
    // schedules another RAF from each callback.
    queueAnimationFrames();

    const captionLabel = mounted!.find('.text-caption-track .caption-label-text');
    expect(captionLabel.exists()).toBe(true);
    expect(captionLabel.text()).toBe('Live transcribed subtitle');

    // Update caption text (e.g. while editing in properties panel)
    const updatedComp = composition();
    const updatedCaption = updatedComp.clips.find((c) => c.id === 'caption-clip') as CaptionClip;
    updatedCaption.caption = {
      type: 'text',
      sentences: [{ id: 's1', text: 'Updated subtitle text', startMs: 1_000, endMs: 4_000, words: [] }],
      style: createDefaultCaptionStyle(),
    };

    vi.useFakeTimers();
    try {
      await mounted!.setProps({ composition: updatedComp });
      await flushPromises();

      // While editing, the updated text stays readable and receives the settling animation.
      const updatedLabel = mounted!.find('.text-caption-track .caption-label-text');
      expect(updatedLabel.text()).toBe('Updated subtitle text');
      expect(updatedLabel.classes()).toContain('caption-settled');

      // The transient animation class is removed after the settling transition.
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      const settledLabel = mounted!.find('.text-caption-track .caption-label-text');
      expect(settledLabel.exists()).toBe(true);
      expect(settledLabel.text()).toBe('Updated subtitle text');
      expect(settledLabel.classes()).not.toContain('caption-settled');
    } finally {
      vi.useRealTimers();
    }

    // Hover marquee triggers
    const indicator = mounted!.find('.text-caption-track .annotation-indicator');
    await indicator.trigger('pointerenter');
    await indicator.trigger('pointerleave');
  });

  it('renders entry and exit transition zones on caption clips in the timeline', async () => {
    const comp = composition();
    const targetCaption = comp.clips.find((c) => c.id === 'caption-clip') as CaptionClip;
    targetCaption.transitions = {
      entry: { preset: { kind: 'fade' }, durationMs: 500 },
      exit: { preset: { kind: 'fade' }, durationMs: 400 },
    };

    const mounted = await mountTracks({
      composition: comp,
    });

    const entryZone = mounted!.find('.text-caption-track .annotation-indicator .transition-zone.entry');
    const exitZone = mounted!.find('.text-caption-track .annotation-indicator .transition-zone.exit');
    expect(entryZone.exists()).toBe(true);
    expect(exitZone.exists()).toBe(true);
  });
});
