import { describe, expect, it } from 'vitest';
import { createBackgroundMedia } from '../backgroundCatalog';
import { useVideoPlayer } from '../useVideoPlayer';

const backgrounds = createBackgroundMedia(['/built-in.png', '/clip.mp4']);

describe('useVideoPlayer', () => {
  it('initializes playback, selection, and track controls from available media', () => {
    const player = useVideoPlayer(backgrounds);
    expect(player.selectedBackground.value).toEqual(backgrounds[0]);
    expect(player.selectedBackgroundMedia.value).toEqual(backgrounds[0]);
    expect(player.backgroundGroups.value.map((group) => group.kind)).toEqual(['image', 'video']);
    expect([player.isPlaying.value, player.currentTime.value, player.duration.value, player.volume.value]).toEqual([
      false,
      0,
      0,
      70,
    ]);
    expect(player.videoSrc.value).toBeNull();
    expect(player.backgroundBlurPercent.value).toBe(0);
    expect(player.importedBackgrounds.value).toEqual([]);
  });

  it('imports backgrounds once, selects them, and puts them before built-ins', () => {
    const player = useVideoPlayer(backgrounds);
    const imported = createBackgroundMedia(['/imported.png'])[0];
    player.addBackground(imported);
    player.addBackground(imported);
    expect(player.selectedBackground.value).toEqual(imported);
    expect(player.selectedBackgroundMedia.value).toEqual(imported);
    expect(player.backgroundGroups.value[0].items).toEqual([imported, backgrounds[0]]);
  });

  it('toggles playing state and clamps finite seeks to the timeline', () => {
    const player = useVideoPlayer([]);
    expect(player.selectedBackgroundMedia.value).toBeNull();
    player.duration.value = 10;
    player.togglePlay();
    player.togglePlay();
    player.seek(-1);
    expect(player.currentTime.value).toBe(0);
    player.seek(4.5);
    expect(player.currentTime.value).toBe(4.5);
    player.seek(99);
    expect(player.currentTime.value).toBe(10);
    expect(player.isPlaying.value).toBe(false);
  });

  it('rejects non-finite seek and invalid time formatting inputs', () => {
    const player = useVideoPlayer([]);
    expect(() => player.seek(Number.NaN)).toThrow(RangeError);
    expect(() => player.seek(Infinity)).toThrow('Playback time must be finite.');
    expect(() => player.formatTime(-1)).toThrow(RangeError);
    expect(() => player.formatTime(Number.NaN)).toThrow(RangeError);
  });

  it('formats whole and fractional times and updates formatted computed values', () => {
    const player = useVideoPlayer([]);
    expect(player.formatTime(0)).toBe('00:00');
    expect(player.formatTime(65.9)).toBe('01:05');
    player.currentTime.value = 125;
    player.duration.value = 3661;
    expect(player.formattedCurrentTime.value).toBe('02:05');
    expect(player.formattedDuration.value).toBe('61:01');
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
