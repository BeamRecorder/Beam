import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptionCompositionLayer } from "../../composition/composition-types";
import { useCaptionDraft } from "./useCaptionDraft";

const captionLayer = (id = "caption-1"): CaptionCompositionLayer => ({
  id,
  kind: "caption",
  name: "Caption",
  startMs: 0,
  endMs: 1000,
  enabled: true,
  order: 0,
  caption: {
    style: {
      color: "#ffffff",
      fontSize: 36,
      shadowColor: "#000000",
      shadowBlur: 0,
      placement: "bottom",
    },
    sentences: [],
  },
});

const mountDraft = (layer = captionLayer()) => {
  const selectedLayer = ref<CaptionCompositionLayer | null>(layer);
  const emitUpdate = vi.fn();
  let draft: ReturnType<typeof useCaptionDraft> | null = null;
  const Harness = defineComponent({
    setup() {
      draft = useCaptionDraft(selectedLayer, emitUpdate);
      return () => h("div");
    },
  });
  return { wrapper: mount(Harness), selectedLayer, emitUpdate, get draft() { return draft!; } };
};

describe("useCaptionDraft", () => {
  afterEach(() => vi.useRealTimers());

  it("waits 500 ms before persisting a local edit", () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((layer) => ({ ...layer, name: "Edited caption" }));

    expect(harness.draft.draft.value?.name).toBe("Edited caption");
    expect(harness.emitUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(harness.emitUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(harness.emitUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Edited caption" }));
  });

  it("flushes the pending edit immediately", () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((layer) => ({ ...layer, name: "Blurred caption" }));
    harness.draft.flush();

    expect(harness.emitUpdate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(harness.emitUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps a dirty draft when an outdated prop is received", async () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((layer) => ({ ...layer, name: "Typing now" }));
    harness.selectedLayer.value = { ...captionLayer(), name: "Old saved value" };
    await nextTick();

    expect(harness.draft.draft.value?.name).toBe("Typing now");
  });

  it("replaces the draft when a different caption is selected", async () => {
    const harness = mountDraft();
    harness.selectedLayer.value = { ...captionLayer("caption-2"), name: "Second caption" };
    await nextTick();

    expect(harness.draft.draft.value).toMatchObject({ id: "caption-2", name: "Second caption" });
  });

  it("persists a pending edit before selecting another caption", async () => {
    vi.useFakeTimers();
    const harness = mountDraft();
    harness.draft.update((layer) => ({ ...layer, name: "Keep this edit" }));
    harness.selectedLayer.value = captionLayer("caption-2");
    await nextTick();

    expect(harness.emitUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Keep this edit" }));
    expect(harness.draft.draft.value?.id).toBe("caption-2");
  });
});
