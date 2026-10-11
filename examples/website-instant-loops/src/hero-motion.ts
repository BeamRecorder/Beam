import { createManualZoom } from '../../../packages/engine/src/zoom/manual-zoom';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import { smooth } from './motion';
import type { HeroState } from './hero-types';
import type { CursorPoint } from './demo-types';

export const HERO_DURATION = 24;
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
export function heroSeconds(ms: number) {
  return Number.isFinite(ms) ? Math.max(0, Math.min(HERO_DURATION * 1000, ms)) / 1000 : 0;
}
export function heroState(t: number): HeroState {
  const time = t >= 23 ? 0 : t;
  const hud = smooth((time - 0.8) / 0.65) * (1 - smooth((time - 6) / 0.65));
  const chat = smooth((time - 12.6) / 0.85) * (1 - smooth((time - 22) / 0.9));
  const chatScale = mix(0.08, 0.84, chat);
  const chatX = mix(354 - 320 * 0.08, 51.2, chat);
  const chatY = mix(370 - 200 * 0.08, 12, chat);
  const attachment = smooth((time - 13.65) / 0.9);
  const sent = smooth((time - 16) / 0.85);
  const minimize = smooth((time - 12.6) / 0.85);
  const chatScroll = 92 * smooth((time - 17.1) / 0.9)
    + 22 * smooth((time - 18.2) / 0.9)
    + 22 * smooth((time - 19.3) / 0.9);
  // The same mounted recording travels through the dock into its attachment.
  const mediaX = mix(mix(51.2, 286 - 640 * 0.08 / 2, minimize), chatX + 62 * chatScale, attachment);
  const mediaY = mix(mix(12, 370 - 400 * 0.08 / 2, minimize), chatY + (mix(130, 129, sent) - chatScroll) * chatScale, attachment);
  const mediaScale = mix(mix(0.84, 0.08, minimize), 260 / 640 * chatScale, attachment);
  return {
    time,
    chatTime: time,
    captureMode: time >= 1.8 ? 'instant' : 'studio',
    menuOpen: (time >= 2.5 && time < 3.75) || (time >= 4.2 && time < 5.4),
    menuStart: time < 4.2 ? 2.5 : 4.2,
    previewPreset: time >= 3 && time < 3.75 ? 1 : time >= 4.6 && time < 5.4 ? 2 : 0,
    previewStart: time < 4.2 ? 3 : 4.6,
    preset: time >= 5.4 ? 'sunrise' : time >= 3.75 ? 'nocturne' : 'default',
    recording: time >= 6 && time < 9,
    stopped: time >= 9,
    completed: time >= 11.4,
    copied: time >= 11.9,
    progress: smooth((time - 9) / 2.4),
    mascotTime: Math.max(0, time - (time >= 11.4 ? 11.4 : 9)),
    hudX: mix(286 - 608 * 0.08 / 2, 122, hud),
    hudY: mix(370 - 236 * 0.08 / 2, 60, hud),
    hudScale: mix(0.08, 0.65, hud),
    hudOpacity: hud,
    statusOpacity: smooth((time - 9) / 0.3) * (1 - smooth((time - 12.6) / 0.35)),
    recorderOpacity: smooth((time - 6.65) / 0.25) * (1 - smooth((time - 9) / 0.2)),
    artworkOpacity: smooth((time - 6.1) / 0.65) * (time >= 22 ? chat : 1),
    artworkTime: Math.max(0, Math.min(2.6, time - 6.5)),
    drag: smooth((time - 7.2) / 0.9),
    attachment,
    sent,
    mediaX, mediaY, mediaScale,
    replies: [17.4, 18.5, 19.6].map(start => smooth((time - start) / 0.6)) as [number, number, number],
    chatScroll,
    chatX, chatY, chatScale, chatOpacity: chat,
    dockActive: time >= 12.6 ? 'chat' : time >= 0.8 ? 'beam' : null,
  };
}
export const HERO_CLICKS: CursorPoint[] = [
  { at: 0.8, x: 286, y: 370 },
  { at: 1.8, x: 326.1, y: 109.4 },
  { at: 2.5, x: 450.58, y: 171.15 },
  { at: 3.75, x: 450.56, y: 241.45 },
  { at: 4.2, x: 450.58, y: 171.15 },
  { at: 5.4, x: 450.56, y: 273.45 },
  { at: 6, x: 170.97, y: 166.6 },
  { at: 7.2, x: 307.4, y: 164.04 },
  { at: 9, x: 415.46, y: 296.08 },
  { at: 12.6, x: 354, y: 370 },
  { at: 13.65, x: 191.48, y: 306 },
  { at: 16, x: 551.84, y: 311.88 },
  { at: 22, x: 354, y: 370 },
];
const path: CursorPoint[] = [
  { at: 0, x: 587, y: 308 },
  { at: 0.65, x: 286, y: 370 },
  { at: 0.95, x: 286, y: 370 },
  { at: 1.65, x: 326.1, y: 109.4 },
  { at: 1.95, x: 326.1, y: 109.4 },
  { at: 2.4, x: 450.58, y: 171.15 },
  { at: 2.65, x: 450.58, y: 171.15 },
  { at: 3, x: 450.56, y: 241.45 },
  { at: 3.9, x: 450.56, y: 241.45 },
  { at: 4.2, x: 450.58, y: 171.15 },
  { at: 4.35, x: 450.58, y: 171.15 },
  { at: 4.6, x: 450.56, y: 273.45 },
  { at: 5.55, x: 450.56, y: 273.45 },
  { at: 6, x: 170.97, y: 166.6 },
  { at: 6.15, x: 170.97, y: 166.6 },
  { at: 6.95, x: 307.4, y: 164.04 },
  { at: 7.2, x: 307.4, y: 164.04 },
  { at: 8.1, x: 329.24, y: 177.48 },
  { at: 8.35, x: 329.24, y: 177.48 },
  { at: 8.85, x: 415.46, y: 296.08 },
  { at: 9.15, x: 415.46, y: 296.08 },
  { at: 9.75, x: 571, y: 256 },
  { at: 12, x: 571, y: 256 },
  { at: 12.6, x: 354, y: 370 },
  { at: 13, x: 354, y: 370 },
  { at: 13.65, x: 191.48, y: 306 },
  { at: 15.1, x: 191.48, y: 306 },
  { at: 15.85, x: 551.84, y: 311.88 },
  { at: 16.45, x: 551.84, y: 311.88 },
  { at: 17.15, x: 580, y: 293 },
  { at: 21, x: 580, y: 293 },
  { at: 22, x: 354, y: 370 },
  { at: 22.3, x: 354, y: 370 },
  { at: 23.8, x: 587, y: 308 },
  { at: 24, x: 587, y: 308 },
];
export function heroPointer(t: number) {
  const index = Math.max(0, path.findLastIndex((point) => point.at <= t));
  const a = path[index]!, b = path[index + 1] ?? a;
  const amount = smooth((t - a.at) / Math.max(0.001, b.at - a.at));
  const click = HERO_CLICKS.findLast((point) => point.at <= t);
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    scale: cursorClickSpringScale(click ? t - click.at : -1, true, 50),
  };
}
export function heroZooms() {
  return [
    { ...createManualZoom('instant-native-preset', 1800, 6000), depth: 1 as const, focus: { cx: 0.5, cy: 0.5 } },
  ];
}
