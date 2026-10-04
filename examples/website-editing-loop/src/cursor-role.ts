import { FIRST_START, SCREEN_Y, TRACK_LEFT, px } from "./motion";
import { clipDuration } from "./timeline-model";
import type { DemoCursorRole, DemoPose } from "./demo-types";

export function cursorRoleForPose(pose: DemoPose): DemoCursorRole {
  // A captured drag keeps its cursor even while crossing another clip's edge.
  if (pose.moveActive > 0) return "default";
  if (pose.trimActive > 0) return "resizewesteast";
  const handleCenter = TRACK_LEFT + px(FIRST_START + clipDuration(pose)) - 5;
  const overHandle =
    Math.abs(pose.cursorX - handleCenter) <= 8 &&
    Math.abs(pose.cursorY - SCREEN_Y) <= 15;
  return overHandle ? "resizewesteast" : "default";
}
