import type {
  CursorEvent,
  CursorKind,
} from "../../../packages/engine/src/capture/capture-session";
import { createCursorMotionPlayer } from "../../../packages/engine/src/cursor/cursor-motion";
import { cursorStateAt } from "../../../packages/engine/src/cursor/cursorPlayback";
import { CLICKS, MOTION, actionAt, stepAt } from "./motion";

const PARK = { x: 337, y: 139 };
const anchors = [
  { at: 0, ...PARK },
  { at: 0.2, ...PARK },
  { at: 0.7, x: 264, y: 115 },
  { at: 1.2, x: 264, y: 115 },
  { at: 1.8, x: 251, y: 115 },
  { at: 2.55, x: 289, y: 115 },
  { at: 2.9, x: 260, y: 115 },
  { at: 3.55, x: 280, y: 112 },
  { at: 3.85, x: 318, y: 115 },
  { at: 4.55, x: 366, y: 115 },
  { at: 4.85, x: 229, y: 102 },
  { at: 5.4, x: 304, y: 130 },
  { at: 5.64, x: 582, y: 126 },
  { at: 6.1, x: 582, y: 126 },
  { at: 6.5, x: 264, y: 115 },
  { at: 7.05, x: 264, y: 115 },
  { at: 7.55, x: 251, y: 115 },
  { at: 8.2, x: 289, y: 115 },
  { at: 8.55, x: 318, y: 142 },
  { at: 9.2, x: 366, y: 142 },
  { at: 9.5, x: 264, y: 115 },
  { at: 10.5, x: 264, y: 115 },
  { at: 10.83, x: 582, y: 126 },
  { at: 11.16, x: 582, y: 126 },
  { at: 11.65, ...PARK },
  { at: 12, ...PARK },
];
// Authored 60 Hz inputs are passed through Beam's real deterministic player.
const events: CursorEvent[] = [];
let previousRole: CursorKind | undefined;
for (let i = 0; i <= 720; i++) {
  const at = i / 60;
  const index = anchors.findIndex((point) => point.at >= at);
  const end = anchors[index],
    start = anchors[Math.max(0, index - 1)];
  const p = end.at === start.at ? 0 : (at - start.at) / (end.at - start.at);
  let x = start.x + (end.x - start.x) * p;
  const y = start.y + (end.y - start.y) * p;
  // Keep the drag hotspot on the moving right edge of the authored card.
  if (at >= 3.85 && at <= 4.5) x = 170 + actionAt(at).width;
  if (at >= 8.55 && at <= 9.2) x = 170 + actionAt(at).width;
  const sessionNs = Math.round(at * 1e9);
  events.push({
    event: "move",
    sessionNs,
    pixelX: x,
    pixelY: y,
    normalizedX: x / 640,
    normalizedY: y / 400,
    visible: true,
  });
  const role: CursorKind = x > 430 ? "handpointing" : stepAt(at).role;
  if (role !== previousRole) {
    previousRole = role;
    events.push({
      event: "shape",
      sessionNs,
      cursorKind: role,
      hotspot: { x: 0, y: 0 },
    });
  }
}
for (const click of CLICKS) {
  for (const pressed of [true, false])
    events.push({
      event: "button",
      sessionNs: Math.round((click.at + (pressed ? 0 : 0.08)) * 1e9),
      button: 1,
      pressed,
      normalizedX: click.x / 640,
      normalizedY: click.y / 400,
    });
}
export const TELEMETRY = events.sort((a, b) => a.sessionNs - b.sessionNs);
const player = createCursorMotionPlayer(TELEMETRY, MOTION, 640, 400);
export function pointerAt(time: number) {
  const at = time >= 11.85 ? 0 : time;
  return player.sample(at, cursorStateAt(TELEMETRY, at))!;
}
