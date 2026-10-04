import {
  createDefaultClipAppearance,
  createDefaultCaptionStyle,
} from "../../../packages/engine/src/shared/composition-defaults";
import type {
  CaptionClip,
  VisualClip,
  AudioClip,
} from "@beam/engine/shared/composition-types";
import type { DemoLane, DemoPose } from "./demo-types";
import {
  FIRST_START,
  INITIAL_DURATION,
  TRIMMED_DURATION,
  INITIAL_NEXT_START,
  FINAL_NEXT_START,
} from "./motion";

export const clipDuration = (pose: DemoPose) =>
  INITIAL_DURATION + (TRIMMED_DURATION - INITIAL_DURATION) * pose.trim;
export const nextStart = (pose: DemoPose) =>
  INITIAL_NEXT_START + (FINAL_NEXT_START - INITIAL_NEXT_START) * pose.move;

const base = (id: string, name: string, start: number, duration: number) => ({
  id,
  name,
  timelineStartMs: start,
  timelineDurationMs: duration,
  sourceInMs: 0,
  sourceDurationMs: 10000,
  playbackRate: 1,
  enabled: true,
  order: 0,
});
const visual = (
  id: string,
  name: string,
  start: number,
  duration: number,
): VisualClip => ({
  ...base(id, name, start, duration),
  kind: "screen",
  assetId: "beautiful-captures",
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance("screen"),
  isMirrored: false,
  isMirroredY: false,
});
const title = (
  id: string,
  content: string,
  start: number,
  duration: number,
): CaptionClip => ({
  ...base(id, content, start, duration),
  kind: "caption",
  caption: {
    type: "text",
    sentences: [{ id, text: content, startMs: 0, endMs: duration, words: [] }],
    style: createDefaultCaptionStyle(),
  },
});

export function lanes(pose: DemoPose): DemoLane[] {
  const audio: AudioClip = {
    ...base("music", "Soundtrack", 0, 9300),
    kind: "audio",
    assetId: "",
    role: "imported",
    volume: 100,
  };
  return [
    {
      id: "titles",
      title: "Titles",
      items: [
        {
          clip: title("title-intro", "Beautiful Captures", FIRST_START, 3700),
          selected: false,
        },
        {
          clip: title("title-outro", "Made with Beam", nextStart(pose), 2400),
          selected: false,
        },
      ],
    },
    {
      id: "screen",
      title: "Screen",
      items: [
        {
          clip: visual(
            "screen-intro",
            "Beautiful Captures",
            FIRST_START,
            clipDuration(pose),
          ),
          selected: pose.trimActive > 0,
        },
        {
          clip: visual(
            "screen-outro",
            "Take a closer look",
            nextStart(pose),
            2700,
          ),
          selected: pose.moveActive > 0,
        },
      ],
    },
    {
      id: "zoom",
      title: "Zoom",
      items: [
        {
          zoom: {
            id: "focus",
            sessionId: "",
            startMs: 1100,
            endMs: 3400,
            focus: { cx: 0.5, cy: 0.5 },
            depth: 2,
            mode: "manual",
            projection: "2d",
          },
          label: "2D zoom",
          selected: false,
        },
      ],
    },
    {
      id: "audio",
      title: "Audio",
      items: [{ clip: audio, selected: false, label: "" }],
    },
  ];
}
