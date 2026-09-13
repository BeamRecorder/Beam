import { defineComponent, h, ref, type Ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotCursorLayer } from '../screenshot-layer-types';

const runtime = vi.hoisted(() => ({
  listCursorPacks: vi.fn(),
  onCursorPacksChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: runtime }));

import { useScreenshotCursors } from '../useScreenshotCursors';

const asset = (id: string): CursorAssetDescriptor => ({
  id,
  label: id,
  url: `project-media://cursor/pack/${id}.svg`,
  format: 'svg',
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 8, y: 4 },
});

const pack = (id: string, name = id, cursorIds = ['pointer']): CursorPackDescriptor => {
  const cursors = cursorIds.map(asset);
  return {
    id,
    name,
    source: 'imported',
    colorMode: 'tintable',
    defaultCursorId: cursors[0]!.id,
    cursors,
    automaticMap: { default: cursors[0]!.id },
  };
};

const cursor = (
  id: string,
  selectedPack: CursorPackDescriptor,
  patch: Partial<ScreenshotCursorLayer> = {},
): ScreenshotCursorLayer => ({
  id,
  name: 'Pointer',
  enabled: true,
  position: { x: 0.4, y: 0.35 },
  size: 45,
  rotation: 0,
  selection: { packId: selectedPack.id, mode: 'fixed', cursorId: selectedPack.defaultCursorId },
  color: '#000000',
  shadowEnabled: true,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowDirection: 'bottom',
  ...patch,
});

const screenshotState = (cursors?: ScreenshotCursorLayer[]): ScreenshotState =>
  ({
    canvas: { width: 1920, height: 1080, showBackground: true },
    background: null,
    blurPercent: 0,
    image: { id: 'screenshot', name: 'Screenshot', enabled: true },
    shapes: [],
    ...(cursors === undefined ? {} : { cursors }),
    format: 'png',
    quality: 0.95,
  }) as unknown as ScreenshotState;

const stateRef = (state: ScreenshotState | null) => ref<ScreenshotState | null>(state);
const selectedRef = (id: string | null) => ref<string | null>(id);

let wrappers: VueWrapper[];
let changed!: () => void;
const unsubscribe = vi.fn();

const mountCursors = (state: Ref<ScreenshotState | null>, selectedId = ref<string | null>(null)) => {
  let cursors!: ReturnType<typeof useScreenshotCursors>;
  const select = vi.fn((id: string) => {
    selectedId.value = id;
  });
  const fail = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        cursors = useScreenshotCursors(state, selectedId, select, fail);
        return () => h('div');
      },
    }),
  );
  wrappers.push(wrapper);
  return { cursors, fail, select, selectedId, wrapper };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  wrappers = [];
  changed = () => undefined;
  unsubscribe.mockReset();
  runtime.listCursorPacks.mockReset().mockResolvedValue([]);
  runtime.onCursorPacksChanged.mockReset().mockImplementation((listener: () => void) => {
    changed = listener;
    return unsubscribe;
  });
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useScreenshotCursors', () => {
  it('loads and sorts packs, refreshes on pack changes, and unsubscribes on unmount', async () => {
    const zebra = pack('pack:zebra', 'Zebra');
    const alpha = pack('pack:alpha', 'Alpha');
    runtime.listCursorPacks.mockResolvedValueOnce([zebra, alpha]);
    const mounted = mountCursors(stateRef(screenshotState()));

    expect(runtime.listCursorPacks).toHaveBeenCalledOnce();
    expect(runtime.onCursorPacksChanged).toHaveBeenCalledOnce();
    expect(mounted.cursors.packs.value[0]?.source).toBe('builtin');
    expect(mounted.cursors.ready.value).toBe(false);
    await flushPromises();
    expect(mounted.cursors.ready.value).toBe(true);
    expect(mounted.cursors.packs.value.slice(-2).map(({ id }) => id)).toEqual(['pack:alpha', 'pack:zebra']);

    const newer = pack('pack:new', 'New pack');
    runtime.listCursorPacks.mockResolvedValueOnce([newer]);
    changed();
    await flushPromises();
    expect(mounted.cursors.packs.value.some(({ id }) => id === 'pack:new')).toBe(true);
    expect(mounted.cursors.packs.value.some(({ id }) => id === 'pack:zebra')).toBe(false);

    mounted.wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reports pack-list failures and can recover on a later library refresh', async () => {
    const failure = new Error('pack library unavailable');
    runtime.listCursorPacks.mockRejectedValueOnce(failure);
    const mounted = mountCursors(stateRef(screenshotState()));
    expect(mounted.cursors.ready.value).toBe(false);
    await flushPromises();
    expect(mounted.cursors.ready.value).toBe(true);
    expect(mounted.fail).toHaveBeenCalledTimes(1);
    expect(mounted.fail).toHaveBeenCalledWith(failure);

    const recovered = pack('pack:recovered', 'Recovered');
    runtime.listCursorPacks.mockResolvedValueOnce([recovered]);
    changed();
    await flushPromises();
    expect(mounted.cursors.packs.value.some(({ id }) => id === recovered.id)).toBe(true);
    expect(mounted.fail).toHaveBeenCalledOnce();
  });

  it('ignores resolved or rejected pack requests that finish after unmount', async () => {
    const success = deferred<CursorPackDescriptor[]>();
    runtime.listCursorPacks.mockReturnValueOnce(success.promise);
    const loaded = mountCursors(stateRef(screenshotState()));
    loaded.wrapper.unmount();
    success.resolve([pack('pack:late', 'Late')]);
    await flushPromises();
    expect(loaded.cursors.packs.value.some(({ id }) => id === 'pack:late')).toBe(false);
    expect(loaded.cursors.ready.value).toBe(false);
    expect(loaded.fail).not.toHaveBeenCalled();

    const failure = deferred<CursorPackDescriptor[]>();
    runtime.listCursorPacks.mockReturnValueOnce(failure.promise);
    const rejected = mountCursors(stateRef(screenshotState()));
    rejected.wrapper.unmount();
    failure.reject(new Error('late failure'));
    await flushPromises();
    expect(rejected.fail).not.toHaveBeenCalled();
    expect(rejected.cursors.ready.value).toBe(false);
  });

  it('ignores a stale refresh after local registration or a newer library refresh', async () => {
    const pendingAtImport = deferred<CursorPackDescriptor[]>();
    runtime.listCursorPacks.mockReturnValueOnce(pendingAtImport.promise);
    const mounted = mountCursors(stateRef(screenshotState()));
    const registered = pack('pack:registered', 'Registered immediately');
    mounted.cursors.registerPack(registered);
    expect(mounted.cursors.ready.value).toBe(true);
    expect(mounted.cursors.packs.value.some(({ id }) => id === registered.id)).toBe(true);

    pendingAtImport.reject(new Error('stale pack request failed'));
    await flushPromises();
    expect(mounted.fail).not.toHaveBeenCalled();
    expect(mounted.cursors.packs.value.some(({ id }) => id === registered.id)).toBe(true);

    const older = deferred<CursorPackDescriptor[]>();
    const newer = deferred<CursorPackDescriptor[]>();
    runtime.listCursorPacks.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    changed();
    changed();

    const newestPack = pack('pack:newest', 'Newest response');
    newer.resolve([registered, newestPack]);
    await flushPromises();
    older.resolve([pack('pack:older', 'Older response')]);
    await flushPromises();

    expect(mounted.cursors.packs.value.some(({ id }) => id === newestPack.id)).toBe(true);
    expect(mounted.cursors.packs.value.some(({ id }) => id === 'pack:older')).toBe(false);
    expect(mounted.cursors.packs.value.some(({ id }) => id === registered.id)).toBe(true);
  });

  it('registers packs before selection and replaces a matching imported pack by ID', async () => {
    const selectedPack = pack('pack:registered', 'First name', ['pointer', 'hand']);
    const state = stateRef(screenshotState([cursor('cursor-1', selectedPack)]));
    const mounted = mountCursors(state, selectedRef('cursor-1'));
    await flushPromises();

    mounted.cursors.registerPack(selectedPack);
    mounted.cursors.registerPack(pack('pack:zeta', 'Zeta'));
    mounted.cursors.registerPack(pack('pack:registered', 'Updated name', ['pointer', 'hand']));
    expect(mounted.cursors.packs.value.filter(({ id }) => id === selectedPack.id)).toHaveLength(1);
    expect(mounted.cursors.packs.value.find(({ id }) => id === selectedPack.id)?.name).toBe('Updated name');

    mounted.cursors.update({ selection: { packId: selectedPack.id, mode: 'automatic', cursorId: null } });
    expect(mounted.cursors.selected.value?.selection).toEqual({
      packId: selectedPack.id,
      mode: 'fixed',
      cursorId: 'pointer',
    });
    mounted.cursors.update({ selection: { packId: selectedPack.id, mode: 'fixed', cursorId: 'hand' } });
    expect(mounted.cursors.selected.value?.selection).toEqual({
      packId: selectedPack.id,
      mode: 'fixed',
      cursorId: 'hand',
    });
  });

  it('adds multiple fixed cursors without replacing existing state or layer settings', async () => {
    const existingPack = pack('pack:existing');
    const existing = cursor('existing-cursor', existingPack);
    const state = stateRef(screenshotState([existing]));
    const selectedId = selectedRef(existing.id);
    const mounted = mountCursors(state, selectedId);
    await flushPromises();
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValueOnce('cursor-added-1').mockReturnValueOnce('cursor-added-2'),
    });

    mounted.cursors.add('First cursor');
    mounted.cursors.add('Second cursor');

    const updated = state.value!;
    const added = updated.cursors!.slice(1);
    expect(added).toHaveLength(2);
    expect(added.map(({ id }) => id)).toEqual(['cursor-added-1', 'cursor-added-2']);
    expect(added.map(({ name }) => name)).toEqual(['First cursor', 'Second cursor']);
    expect(added.every(({ selection }) => selection.mode === 'fixed')).toBe(true);
    expect(added[0]?.selection.packId).toBe(mounted.cursors.packs.value[0]?.id);
    expect(mounted.select).toHaveBeenNthCalledWith(1, 'cursor-added-1');
    expect(mounted.select).toHaveBeenNthCalledWith(2, 'cursor-added-2');
    expect(mounted.cursors.selected.value?.id).toBe('cursor-added-2');
    expect(updated.cursors?.[0]).toEqual(existing);
    expect(updated.composition?.find(({ id }) => id === existing.id)).toMatchObject({
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
    });
    expect(updated.composition?.map(({ id }) => id)).toContain('cursor-added-2');
  });

  it('keeps add and update operations safe when state or selection is absent', async () => {
    const empty = mountCursors(stateRef(null));
    await flushPromises();
    empty.cursors.add('No project');
    empty.cursors.update({ size: 99 });
    empty.cursors.transform({ x: 0.2, y: 0.3, width: 0.5, height: 0.4 });
    expect(empty.select).not.toHaveBeenCalled();

    const state = stateRef(screenshotState([cursor('cursor-1', pack('pack:missing'))]));
    const noSelection = mountCursors(state, selectedRef('absent'));
    await flushPromises();
    noSelection.cursors.update({ size: 90 });
    noSelection.cursors.transform({ x: 0.2, y: 0.3, width: 0.5, height: 0.4 });
    expect(state.value?.cursors?.[0]?.size).toBe(45);

    noSelection.selectedId.value = 'cursor-1';
    noSelection.cursors.transform({ x: 0.2, y: 0.3, width: 0.5, height: 0.4 });
    expect(state.value?.cursors?.[0]?.position).toEqual({ x: 0.4, y: 0.35 });
  });

  it('transforms the selected cursor and applies appearance patches and supported pack selections', async () => {
    const selectedPack = pack('pack:appearance', 'Appearance', ['pointer', 'hand']);
    const selectedCursor = cursor('cursor-1', selectedPack);
    runtime.listCursorPacks.mockResolvedValueOnce([selectedPack]);
    const state = stateRef(screenshotState([selectedCursor]));
    const mounted = mountCursors(state, selectedRef('cursor-1'));
    await flushPromises();

    mounted.cursors.transform({ x: 0.25, y: 0.2, width: 0.046875, height: 0.0416666667 });
    expect(selectedCursor.position).toEqual({ x: 0.25, y: 0.2 });
    expect(selectedCursor.size).toBeCloseTo(90);

    mounted.cursors.update({
      size: 72,
      color: '#abcdef',
      shadowEnabled: false,
      shadowBlur: 11,
      shadowColor: '#fedcba',
      shadowDirection: 'top-left',
      rotation: 45,
    });
    expect(selectedCursor).toMatchObject({
      size: 72,
      color: '#abcdef',
      shadowEnabled: false,
      shadowBlur: 11,
      shadowColor: '#fedcba',
      shadowDirection: 'top-left',
      rotation: 45,
    });

    mounted.cursors.update({ selection: { packId: 'pack:unavailable', mode: 'fixed', cursorId: 'missing' } });
    expect(selectedCursor.selection).toEqual({ packId: selectedPack.id, mode: 'fixed', cursorId: 'pointer' });
    mounted.cursors.update({ selection: { packId: selectedPack.id, mode: 'fixed', cursorId: null } });
    expect(selectedCursor.selection).toEqual({ packId: selectedPack.id, mode: 'fixed', cursorId: 'pointer' });
  });
});
