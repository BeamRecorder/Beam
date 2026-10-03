import { sourceTimeAt } from '@beam/engine/shared/timeline-mapping';
import type { HtmlSceneSource } from '@beam/engine/html/html-types';
import type { HtmlClockEngine, HtmlPlaybackClock } from './html-playback-types';

/** A lazy adapter keeps the existing Mediabunny clock authoritative, without a UI tick. */
export function createHtmlPlaybackClock(engine: () => HtmlClockEngine): HtmlPlaybackClock {
  return {
    currentTime: () => engine().currentTime,
    subscribe(listener) {
      const playback = engine();
      const stopTime = playback.on('time', listener);
      const stopState = playback.on('state', () => listener(playback.currentTime));
      return () => {
        stopTime();
        stopState();
      };
    },
  };
}

/** The transport is host-owned; source mapping and clock subscription are reusable headlessly. */
export function bindHtmlPlaybackSource(
  source: HtmlSceneSource,
  clock: HtmlPlaybackClock,
  send: (timeMs: number) => void,
) {
  const present = (seconds: number) => {
    const time = sourceTimeAt(source.clip, seconds * 1000);
    if (time !== null) send(Math.min(source.html.durationMs, time));
  };
  const stop = clock.subscribe(present);
  return { sync: () => present(clock.currentTime()), dispose: stop };
}
