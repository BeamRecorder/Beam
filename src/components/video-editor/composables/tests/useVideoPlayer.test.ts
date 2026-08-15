import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { createBackgroundMedia } from '../backgroundCatalog';
import { useVideoPlayer } from '../useVideoPlayer';
import type { ClipComposition } from '~/media/shared';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';

const playback = vi.hoisted(() => {
  const instances: FakePlayback[] = [];
  class FakePlayback {
    readonly listeners = new Map<string, (value: never) => void>();
    readonly loadComposition = vi.fn(async (_composition: ClipComposition) => {
      this.emit('state', 'paused');
    });
    readonly play = vi.fn(async (time: number) => {
      this.emit('time', time);
      this.emit('state', 'playing');
    });
    readonly pause = vi.fn(() => this.emit('state', 'paused'));
    readonly seek = vi.fn(async (time: number) => {
      this.emit('time', time);
      return 'presented' as const;
    });
    readonly setVolume = vi.fn();
    readonly dispose = vi.fn();
    readonly frameFor = vi.fn(() => null);

    constructor() {
      instances.push(this);
    }
    on(event: string, listener: (value: never) => void) {
      this.listeners.set(event, listener);
      return () => this.listeners.delete(event);
    }
    private emit(event: string, value: unknown) {
      this.listeners.get(event)?.(value as never);
    }
  }
  return { FakePlayback, instances };
});
vi.mock('~/media/playback', () => ({ MediaPlaybackEngine: playback.FakePlayback }));

const backgrounds = createBackgroundMedia(['/built-in.png', '/clip.mp4']);
const composition: ClipComposition = {
  schemaVersion: 3,
  keyboardCaptionSessions: [],
  assets: [],
  clips: [
    {
      id: 'clip',
      kind: 'video',
      name: 'Clip',
      assetId: 'asset',
      timelineStartMs: 500,
      timelineDurationMs: 2_000,
      sourceInMs: 0,
      sourceDurationMs: 2_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('video'),
      isMirrored: false,
      isMirroredY: false,
    },
  ],
};

describe('useVideoPlayer', () => {
  it('initializes background selection and explicit playback state', () => {
    const player = useVideoPlayer(backgrounds);
    expect(player.selectedBackground.value).toEqual(backgrounds[0]);
    expect(player.selectedBackgroundMedia.value).toEqual(backgrounds[0]);
    expect(player.backgroundGroups.value.map((group) => group.kind)).toEqual(['image', 'video']);
    expect([
      player.isPlaying.value,
      player.currentTime.value,
      player.duration.value,
      player.volume.value,
      player.playbackState.value,
    ]).toEqual([false, 0, 0, 70, 'idle']);
    expect(player.frameFor('missing')).toBeNull();
  });

  it('imports backgrounds once, selects them, and puts them before built-ins', () => {
    const player = useVideoPlayer(backgrounds);
    const imported = createBackgroundMedia(['/imported.png'])[0];
    player.addBackground(imported);
    player.addBackground(imported);
    expect(player.selectedBackground.value).toEqual(imported);
    expect(player.backgroundGroups.value[0].items).toEqual([imported, backgrounds[0]]);
  });

  it('delegates play and seek intentions to the owner engine while clamping the timeline', async () => {
    const player = useVideoPlayer([]);
    await player.loadComposition(composition);
    const engine = playback.instances.at(-1)!;
    expect(player.duration.value).toBe(2.5);
    await player.setPlaying(true);
    expect(engine.play).toHaveBeenCalledWith(0);
    expect(player.playbackState.value).toBe('playing');
    await player.seek(9, 'scrub');
    expect(engine.seek).toHaveBeenCalledWith(2.5, 'scrub');
    expect(player.currentTime.value).toBe(2.5);
    await player.setPlaying(false);
    expect(engine.pause).toHaveBeenCalled();
    expect(player.isPlaying.value).toBe(false);
  });

  it('invalidates the cached frame before reloading and exposes the replacement frame', async () => {
    const player = useVideoPlayer([]);
    await player.loadComposition(composition);
    const engine = playback.instances.at(-1)!;
    const replacement = {
      clipId: 'clip',
      bitmap: {} as ImageBitmap,
      timestampSeconds: 0,
      durationSeconds: 1,
      width: 2,
      height: 2,
      byteSize: 16,
      close: vi.fn(),
    };
    engine.frameFor.mockReturnValue(replacement as never);
    let versionAtReload = -1;
    engine.loadComposition.mockImplementationOnce(async () => {
      versionAtReload = player.frameVersion.value;
      engine.listeners.get('state')?.('paused' as never);
      engine.listeners.get('frame')?.({ clipId: 'clip' } as never);
    });

    await player.loadComposition(composition);

    expect(versionAtReload).toBe(2);
    expect(player.frameVersion.value).toBe(3);
    expect(player.frameFor('clip')).toBe(replacement);
  });

  it('does not let an older project load seek after a newer project has finished loading', async () => {
    const scope = effectScope();
    let player!: ReturnType<typeof useVideoPlayer>;
    scope.run(() => {
      player = useVideoPlayer([]);
    });
    await player.setPlaying(false);
    const engine = playback.instances.at(-1)!;
    player.currentTime.value = 1;
    engine.loadComposition.mockReset();
    engine.seek.mockClear();
    let finishFirstLoad!: () => void;
    engine.loadComposition
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirstLoad = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    const firstLoad = player.loadComposition(composition);
    const replacement = {
      ...composition,
      clips: [{ ...composition.clips[0]!, timelineDurationMs: 5_000 }],
    };
    const secondLoad = player.loadComposition(replacement);
    await secondLoad;
    expect(player.duration.value).toBe(5.5);
    expect(engine.seek).toHaveBeenCalledOnce();

    finishFirstLoad();
    await firstLoad;
    expect(engine.seek).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('does not continue a pending project load after its scope is disposed', async () => {
    const scope = effectScope();
    let player!: ReturnType<typeof useVideoPlayer>;
    scope.run(() => {
      player = useVideoPlayer([]);
    });
    await player.setPlaying(false);
    const engine = playback.instances.at(-1)!;
    player.currentTime.value = 1;
    engine.loadComposition.mockReset();
    engine.seek.mockClear();
    let finishLoad!: () => void;
    engine.loadComposition.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    );

    const pendingLoad = player.loadComposition(composition);
    scope.stop();
    expect(engine.dispose).toHaveBeenCalledOnce();

    finishLoad();
    await pendingLoad;
    expect(engine.seek).not.toHaveBeenCalled();
  });

  it('rejects non-finite seeks and reports engine loading errors through state', async () => {
    const player = useVideoPlayer([]);
    await player.loadComposition(composition);
    await expect(player.seek(Number.NaN)).rejects.toThrow('Playback time must be finite.');
    await expect(player.seek(Infinity)).rejects.toThrow('Playback time must be finite.');
    const engine = playback.instances.at(-1)!;
    engine.listeners.get('error')?.({ kind: 'decode-failure', sourceId: 'asset', message: 'decode failed' } as never);
    expect(player.playbackState.value).toBe('paused');
    expect(player.playbackError.value).toMatchObject({ kind: 'decode-failure' });
  });

  it('formats whole and fractional times and updates formatted computed values', () => {
    const player = useVideoPlayer([]);
    expect(player.formatTime(0)).toBe('00:00');
    expect(player.formatTime(65.9)).toBe('01:05');
    player.currentTime.value = 125;
    player.duration.value = 3661;
    expect(player.formattedCurrentTime.value).toBe('02:05');
    expect(player.formattedDuration.value).toBe('61:01');
    expect(() => player.formatTime(-1)).toThrow(RangeError);
  });

  it('restores a selected imported background by id or path and falls back when it disappears', () => {
    const player = useVideoPlayer(backgrounds);
    const imported = createBackgroundMedia(['/imported.png'])[0];
    player.restoreBackgrounds([imported], imported.path);
    expect(player.selectedBackground.value).toEqual(imported);
    player.setUserBackgrounds([]);
    expect(player.selectedBackground.value).toEqual(backgrounds[0]);
    player.restoreBackgrounds([], 'unknown-id');
    expect(player.selectedBackground.value).toEqual(backgrounds[0]);
  });
});
