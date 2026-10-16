import { nextTick, shallowRef } from 'vue';
import { createPinia, setActivePinia, getActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEditorData } from '~/api/types/capture-api';
import { useToastStore } from '~/components/ui/toast/toastStore';
import { useCursorHoverAnalysis } from '../useCursorHoverAnalysis';
import type { CursorHoverSync } from '@beam/engine/cursor/cursor-hover-types';
const analyze = vi.hoisted(() => vi.fn());
vi.mock('@beam/runtime/cursor/hover/hover-analysis-browser', () => ({ analyzeCursorHoversInBackground: analyze }));

const sync: CursorHoverSync = { version: 1, ranges: [{ startSeconds: 1, endSeconds: 2 }] };
function data(): ProjectEditorData {
  return {
    sessionId: 'a',
    manifest: { durationNs: 4e9 },
    cursor: { available: true, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    tracks: [
      {
        kind: 'screen',
        assets: [
          {
            path: 'screen.mp4',
            startNs: 0,
            endNs: 4e9,
            complete: true,
            exists: true,
            src: 'project-media://a/screen.mp4',
          },
        ],
      },
    ],
  } as unknown as ProjectEditorData;
}
function fixture(initial: ProjectEditorData | null = data()) {
  const input = shallowRef(initial);
  let output!: ReturnType<typeof useCursorHoverAnalysis>;
  const wrapper = mount(
    {
      setup() {
        output = useCursorHoverAnalysis(input);
        return () => null;
      },
    },
    { global: { plugins: [getActivePinia()!] } },
  );
  return { scope: { stop: () => wrapper.unmount() }, input, output };
}
beforeEach(() => {
  setActivePinia(createPinia());
  analyze.mockReset().mockResolvedValue(sync);
});
describe('editor hover analysis ownership', () => {
  it('publishes immutable analysis without delaying initial editor data', async () => {
    let resolve!: (value: CursorHoverSync) => void;
    analyze.mockReturnValue(
      new Promise<CursorHoverSync>((done) => {
        resolve = done;
      }),
    );
    const original = data(),
      f = fixture(original);
    expect(f.output.value?.cursor.hoverSync).toBeUndefined();
    expect(f.output.value?.cursor.hoverSources).toHaveLength(1);
    resolve(sync);
    await flushPromises();
    expect(f.output.value?.cursor.hoverSync).toEqual(sync);
    expect(f.output.value?.cursor.events).toBe(original.cursor.events);
    expect(original.cursor.hoverSync).toBeUndefined();
    f.scope.stop();
  });
  it('keeps slow background analysis silent through completion and unmount', async () => {
    vi.useFakeTimers();
    let finish!: (value: CursorHoverSync) => void;
    analyze.mockReturnValue(
      new Promise<CursorHoverSync>((resolve) => {
        finish = resolve;
      }),
    );
    const f = fixture();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useToastStore().toasts).toEqual([]);
    expect(f.output.value?.sessionId).toBe('a');
    finish(sync);
    await flushPromises();
    expect(useToastStore().toasts).toEqual([]);
    f.scope.stop();
    analyze.mockReturnValue(new Promise(() => {}));
    const pending = fixture();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useToastStore().toasts).toEqual([]);
    pending.scope.stop();
    expect(useToastStore().toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  it('cancels superseded projects and ignores their late results', async () => {
    let finish!: (value: CursorHoverSync) => void;
    analyze.mockReturnValueOnce(
      new Promise<CursorHoverSync>((resolve) => {
        finish = resolve;
      }),
    );
    const f = fixture();
    const firstSignal = analyze.mock.calls[0]![1] as AbortSignal;
    f.input.value = data();
    await nextTick();
    await flushPromises();
    finish({ version: 1, ranges: [] });
    await flushPromises();
    expect(firstSignal.aborted).toBe(true);
    expect(f.output.value?.cursor.hoverSync).toEqual(sync);
    const lastSignal = analyze.mock.calls[1]![1] as AbortSignal;
    f.scope.stop();
    expect(lastSignal.aborted).toBe(true);
  });
  it('skips absent cursor data, existing analysis, embedded cursors and missing screen assets', async () => {
    for (const owner of [
      null,
      { ...data(), cursor: { ...data().cursor, available: false } },
      { ...data(), cursor: { ...data().cursor, hoverSync: sync } },
      { ...data(), manifest: { ...data().manifest, cursorEmbedded: true } },
      { ...data(), tracks: [] },
    ]) {
      const f = fixture(owner);
      await flushPromises();
      expect(analyze).not.toHaveBeenCalled();
      f.scope.stop();
    }
  });
  it('reports analysis failure with a localized persistent message and retains original movement', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    analyze.mockRejectedValue(new Error('GPU unavailable'));
    const f = fixture();
    await flushPromises();
    expect(useToastStore().toasts[0]).toMatchObject({ type: 'error', duration: 0 });
    expect(useToastStore().toasts[0]!.message).toContain('Unable to synchronize hover effects');
    expect(f.output.value?.cursor.hoverSync).toBeUndefined();
    f.scope.stop();
    error.mockRestore();
  });
  it('suppresses errors from a cancelled worker and clears data on project close', async () => {
    let reject!: (error: Error) => void;
    analyze.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const f = fixture();
    f.input.value = null;
    await nextTick();
    reject(new Error('cancelled'));
    await flushPromises();
    expect(f.output.value).toBeNull();
    expect(useToastStore().toasts).toEqual([]);
    f.scope.stop();
  });
  it('maps pause/resume sources in recording order and excludes unavailable files', async () => {
    const owner = data(),
      track = owner.tracks[0]!,
      first = track.assets[0]!;
    track.assets = [
      { ...first, path: 'second', startNs: 7e9, endNs: 9e9 },
      { ...first, exists: false },
      first,
      { ...first, complete: false },
      { ...first, src: null },
    ];
    const f = fixture(owner);
    await flushPromises();
    expect(analyze.mock.calls[0]![0].sources.map((source: { startSeconds: number }) => source.startSeconds)).toEqual([
      0, 7,
    ]);
    f.scope.stop();
  });
});
