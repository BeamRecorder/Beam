import { defineComponent, h, nextTick, reactive } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clip, ClipComposition } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../../zoom/zoom-types';
import type { TimelineTracksProps } from '../timeline-tracks-types';
import { useTimelineItemInteractions } from '../useTimelineItemInteractions';

type HarnessProps = {
  selectedClipId: string | null;
  selectedClipIds?: string[];
  selectedZoomId: string | null;
  selectedZoomIds?: string[];
  composition?: Pick<ClipComposition, 'clips'>;
  zoomElements?: ZoomElement[];
};

const clip = (id: string) => ({ id }) as Clip;
const zoom = (id: string) => ({ id }) as ZoomElement;

const pointerEvent = ({
  type = 'pointermove',
  pointerId = 1,
  clientX = 0,
  clientY = 0,
  button = 0,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
}: {
  type?: string;
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
} = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    button: { value: button },
    ctrlKey: { value: ctrlKey },
    metaKey: { value: metaKey },
    shiftKey: { value: shiftKey },
  });
  return event as unknown as PointerEvent;
};

const clickEvent = ({
  detail = 1,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
}: {
  detail?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
} = {}) => new MouseEvent('click', { detail, ctrlKey, metaKey, shiftKey });

const createHarness = (
  initial: HarnessProps = {
    selectedClipId: null,
    selectedClipIds: [],
    selectedZoomId: null,
    selectedZoomIds: [],
  },
) => {
  const props = reactive({ composition: { clips: [] }, zoomElements: [], ...initial }) as HarnessProps &
    Record<string, unknown>;
  const emit = vi.fn();
  const beginClipMove = vi.fn((_event: PointerEvent, _clip: Clip) => undefined);
  const beginZoomMove = vi.fn((_event: PointerEvent, _zoom: ZoomElement) => undefined);
  const Harness = defineComponent({
    setup() {
      return useTimelineItemInteractions({
        props: props as unknown as TimelineTracksProps,
        emit,
        beginClipMove,
        beginZoomMove,
      });
    },
    render: () => h('div'),
  });
  const wrapper = mount(Harness);
  return { wrapper, props, emit, beginClipMove, beginZoomMove };
};

const mountedWrappers: VueWrapper[] = [];
const track = <T extends ReturnType<typeof createHarness>>(harness: T) => {
  mountedWrappers.push(harness.wrapper);
  return harness;
};

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
});

describe('useTimelineItemInteractions', () => {
  it('derives array and fallback primary selections and emits every selection intent', async () => {
    const harness = track(
      createHarness({
        selectedClipId: 'clip-primary',
        selectedClipIds: ['clip-array'],
        selectedZoomId: 'zoom-primary',
        selectedZoomIds: ['zoom-array'],
      }),
    );
    const vm = harness.wrapper.vm;

    expect(vm.selectedClipIdSet).toEqual(new Set(['clip-array']));
    expect(vm.selectedZoomIdSet).toEqual(new Set(['zoom-array']));

    vm.selectItem('clip', 'clip-range', clickEvent({ shiftKey: true }));
    vm.selectItem('clip', 'clip-toggle', clickEvent({ ctrlKey: true }));
    vm.selectItem('zoom', 'zoom-toggle', clickEvent({ metaKey: true }));
    vm.selectItem('zoom', 'zoom-replace', clickEvent());
    expect(harness.emit.mock.calls.map(([, request]) => request)).toEqual([
      { kind: 'clip', id: 'clip-range', intent: 'range' },
      { kind: 'clip', id: 'clip-toggle', intent: 'toggle' },
      { kind: 'zoom', id: 'zoom-toggle', intent: 'toggle' },
      { kind: 'zoom', id: 'zoom-replace', intent: 'replace' },
    ]);

    harness.props.selectedClipIds = [];
    harness.props.selectedZoomIds = [];
    await nextTick();
    expect(vm.selectedClipIdSet).toEqual(new Set(['clip-primary']));
    expect(vm.selectedZoomIdSet).toEqual(new Set(['zoom-primary']));

    harness.props.selectedClipIds = undefined;
    harness.props.selectedZoomIds = undefined;
    harness.props.selectedClipId = null;
    harness.props.selectedZoomId = null;
    await nextTick();
    expect(vm.selectedClipIdSet).toEqual(new Set());
    expect(vm.selectedZoomIdSet).toEqual(new Set());
  });

  it('ignores non-left or modified clip moves and starts selected and new clips correctly', () => {
    const harness = track(
      createHarness({
        selectedClipId: 'selected-clip',
        selectedClipIds: ['selected-clip'],
        selectedZoomId: null,
        selectedZoomIds: [],
      }),
    );
    const selected = clip('selected-clip');
    const start = (options: Parameters<typeof pointerEvent>[0]) =>
      harness.wrapper.vm.startClipMove(pointerEvent(options), selected);

    start({ button: 2 });
    start({ ctrlKey: true });
    start({ metaKey: true });
    start({ shiftKey: true });
    expect(harness.beginClipMove).not.toHaveBeenCalled();
    expect(harness.emit).not.toHaveBeenCalled();

    start({ pointerId: 2, button: 0, clientX: 40, clientY: 50 });
    expect(harness.beginClipMove).toHaveBeenCalledTimes(1);
    expect(harness.emit).not.toHaveBeenCalled();
    window.dispatchEvent(pointerEvent({ type: 'pointercancel', pointerId: 2, clientX: 40, clientY: 50 }));

    harness.wrapper.vm.startClipMove(pointerEvent({ pointerId: 3 }), clip('new-clip'));
    expect(harness.emit).toHaveBeenCalledWith('select:item', {
      kind: 'clip',
      id: 'new-clip',
      intent: 'replace',
    });
    expect(harness.beginClipMove).toHaveBeenCalledTimes(2);
    window.dispatchEvent(pointerEvent({ type: 'pointercancel', pointerId: 3 }));
  });

  it('keeps a locked clip selectable but never starts its move', () => {
    const locked = clip('locked-clip');
    locked.locked = true;
    const harness = track(
      createHarness({
        selectedClipId: null,
        selectedClipIds: [],
        selectedZoomId: null,
        selectedZoomIds: [],
        composition: { clips: [locked] },
      }),
    );

    harness.wrapper.vm.startClipMove(pointerEvent({ pointerId: 6 }), locked);

    expect(harness.emit).toHaveBeenCalledWith('select:item', {
      kind: 'clip',
      id: locked.id,
      intent: 'replace',
    });
    expect(harness.beginClipMove).not.toHaveBeenCalled();
  });

  it('blocks moving a free group member when a linked member is locked', () => {
    const free = clip('free-group-member');
    free.groupId = 'linked-group';
    const locked = clip('locked-group-member');
    locked.groupId = 'linked-group';
    locked.locked = true;
    const harness = track(
      createHarness({
        selectedClipId: free.id,
        selectedClipIds: [free.id],
        selectedZoomId: null,
        selectedZoomIds: [],
        composition: { clips: [free, locked] },
      }),
    );

    harness.wrapper.vm.startClipMove(pointerEvent({ pointerId: 7 }), free);

    expect(harness.emit).not.toHaveBeenCalled();
    expect(harness.beginClipMove).not.toHaveBeenCalled();
  });

  it('ignores non-left or modified zoom moves and starts selected and new zooms correctly', () => {
    const harness = track(
      createHarness({
        selectedClipId: null,
        selectedClipIds: [],
        selectedZoomId: 'selected-zoom',
        selectedZoomIds: ['selected-zoom'],
      }),
    );
    const selected = zoom('selected-zoom');
    const start = (options: Parameters<typeof pointerEvent>[0]) =>
      harness.wrapper.vm.startZoomMove(pointerEvent(options), selected);

    start({ button: 1 });
    start({ ctrlKey: true });
    start({ metaKey: true });
    start({ shiftKey: true });
    expect(harness.beginZoomMove).not.toHaveBeenCalled();
    expect(harness.emit).not.toHaveBeenCalled();

    start({ pointerId: 4, button: 0 });
    expect(harness.beginZoomMove).toHaveBeenCalledTimes(1);
    expect(harness.emit).not.toHaveBeenCalled();
    window.dispatchEvent(pointerEvent({ type: 'pointercancel', pointerId: 4 }));

    harness.wrapper.vm.startZoomMove(pointerEvent({ pointerId: 5 }), zoom('new-zoom'));
    expect(harness.emit).toHaveBeenCalledWith('select:item', {
      kind: 'zoom',
      id: 'new-zoom',
      intent: 'replace',
    });
    expect(harness.beginZoomMove).toHaveBeenCalledTimes(2);
    window.dispatchEvent(pointerEvent({ type: 'pointercancel', pointerId: 5 }));
  });

  it('keeps a locked zoom selectable but never starts its move', () => {
    const locked = zoom('locked-zoom');
    locked.locked = true;
    const harness = track(
      createHarness({
        selectedClipId: null,
        selectedClipIds: [],
        selectedZoomId: null,
        selectedZoomIds: [],
        composition: { clips: [] },
        zoomElements: [locked],
      }),
    );

    harness.wrapper.vm.startZoomMove(pointerEvent({ pointerId: 8 }), locked);

    expect(harness.emit).toHaveBeenCalledWith('select:item', {
      kind: 'zoom',
      id: locked.id,
      intent: 'replace',
    });
    expect(harness.beginZoomMove).not.toHaveBeenCalled();
  });

  it('suppresses a trailing pointer click while allowing a keyboard detail-zero click', () => {
    const harness = track(
      createHarness({
        selectedClipId: 'clip-1',
        selectedClipIds: ['clip-1'],
        selectedZoomId: null,
        selectedZoomIds: [],
      }),
    );
    const vm = harness.wrapper.vm;
    vm.startClipMove(pointerEvent({ pointerId: 10, clientX: 100, clientY: 100 }), clip('clip-1'));

    window.dispatchEvent(pointerEvent({ pointerId: 99, clientX: 200, clientY: 200 }));
    window.dispatchEvent(pointerEvent({ type: 'pointerup', pointerId: 99, clientX: 200, clientY: 200 }));
    window.dispatchEvent(pointerEvent({ pointerId: 10, clientX: 102, clientY: 103 }));
    window.dispatchEvent(pointerEvent({ pointerId: 10, clientX: 106, clientY: 100 }));

    vm.selectItem('clip', 'clip-1', clickEvent({ detail: 1 }));
    expect(harness.emit).not.toHaveBeenCalled();

    window.dispatchEvent(pointerEvent({ type: 'pointerup', pointerId: 10, clientX: 106, clientY: 100 }));
    vm.selectItem('clip', 'clip-1', clickEvent({ detail: 0 }));
    expect(harness.emit).toHaveBeenCalledWith('select:item', {
      kind: 'clip',
      id: 'clip-1',
      intent: 'replace',
    });
  });

  it('resets click suppression on pointercancel and ignores unrelated pointer events', () => {
    const harness = track(
      createHarness({
        selectedClipId: 'clip-1',
        selectedClipIds: ['clip-1'],
        selectedZoomId: null,
        selectedZoomIds: [],
      }),
    );
    const vm = harness.wrapper.vm;
    vm.startClipMove(pointerEvent({ pointerId: 20, clientX: 10, clientY: 10 }), clip('clip-1'));
    window.dispatchEvent(pointerEvent({ pointerId: 21, clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent({ type: 'pointercancel', pointerId: 21, clientX: 100, clientY: 100 }));
    vm.selectItem('clip', 'clip-1', clickEvent({ detail: 1 }));
    expect(harness.emit).toHaveBeenCalledWith('select:item', {
      kind: 'clip',
      id: 'clip-1',
      intent: 'replace',
    });

    vm.startClipMove(pointerEvent({ pointerId: 22, clientX: 10, clientY: 10 }), clip('clip-1'));
    window.dispatchEvent(pointerEvent({ pointerId: 22, clientX: 20, clientY: 10 }));
    window.dispatchEvent(pointerEvent({ type: 'pointercancel', pointerId: 22, clientX: 20, clientY: 10 }));
    vm.selectItem('clip', 'clip-1', clickEvent({ detail: 1 }));
    expect(harness.emit).toHaveBeenCalledTimes(2);
  });

  it('removes active drag listeners when a second drag starts and when the harness unmounts', () => {
    const harness = track(
      createHarness({
        selectedClipId: 'clip-1',
        selectedClipIds: ['clip-1'],
        selectedZoomId: null,
        selectedZoomIds: [],
      }),
    );
    const vm = harness.wrapper.vm;
    vm.startClipMove(pointerEvent({ pointerId: 30, clientX: 0, clientY: 0 }), clip('clip-1'));
    vm.startClipMove(pointerEvent({ pointerId: 31, clientX: 0, clientY: 0 }), clip('clip-1'));
    window.dispatchEvent(pointerEvent({ pointerId: 30, clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent({ type: 'pointerup', pointerId: 30, clientX: 100, clientY: 100 }));

    harness.wrapper.unmount();
    window.dispatchEvent(pointerEvent({ pointerId: 31, clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointerEvent({ type: 'pointerup', pointerId: 31, clientX: 100, clientY: 100 }));
    expect(harness.beginClipMove).toHaveBeenCalledTimes(2);
  });
});
