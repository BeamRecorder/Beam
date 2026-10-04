import { describe, expect, it } from "vitest";
import { resolveClipTransitionState } from "../../../packages/engine/src/shared/clip-transitions";
import { elementClips, previewClip } from "../src/scene-model";
describe("native transition model", () => {
  it("gives the actual compositor a slide transition", () => {
    const clip = previewClip(1);
    expect(clip.kind).toBe("image");
    expect(clip.transitions?.entry?.preset).toEqual({
      kind: "slide",
      direction: "left",
    });
    expect(resolveClipTransitionState(clip, 0).translateX).not.toBe(0);
    expect(resolveClipTransitionState(clip, 500).translateX).toBe(0);
  });
  it("removes the clip transition when selecting the canvas", () =>
    expect(previewClip(5.2).transitions).toEqual({ entry: null, exit: null }));
  it("does not create elements before the text action", () =>
    expect(elementClips(6).length).toBe(0));
  it("creates editable shape and text clips with native entry transitions", () => {
    const [shape, text] = elementClips(6.3);
    expect(shape!.kind).toBe("shape");
    expect(shape!.preset).toBe("rounded-rectangle");
    expect(text!.family).toBe("text");
    expect(text!.text?.content).toBe("Made to move.");
    expect(text!.timelineStartMs).toBe(6200);
    expect(text!.timelineDurationMs).toBe(1800);
    expect(resolveClipTransitionState(text!, 6200).opacity).toBe(0);
    expect(resolveClipTransitionState(text!, 6700).translateY).toBe(0);
  });
  it("resets the clip and overlays at the loop seam", () => {
    expect(previewClip(8)).toEqual(previewClip(0));
    expect(elementClips(8)).toEqual([]);
  });
});
