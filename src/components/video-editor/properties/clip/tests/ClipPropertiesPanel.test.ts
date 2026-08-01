import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ClipPropertiesPanel from "../ClipPropertiesPanel.vue";

const BigSliderStub = defineComponent({
  name: "BigSlider",
  props: { modelValue: { type: Number, default: 0 }, label: { type: String, default: "" } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () => h("button", { class: "slider-stub", "data-label": props.label, onClick: () => emit("update:modelValue", props.modelValue + 10) }, props.label);
  },
});

const SwitchStub = defineComponent({
  name: "Switch",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  setup(_, { emit }) {
    return () => h("button", { class: "switch-stub", onClick: () => emit("update:modelValue", true) }, "switch");
  },
});

const ColorPickerStub = defineComponent({
  name: "ColorPicker",
  emits: ["update:modelValue"],
  setup(_, { emit }) {
    return () => h("button", { class: "color-stub", onClick: () => emit("update:modelValue", "#abcdef") }, "color");
  },
});

const ShadowDirectionStub = defineComponent({
  name: "ShadowDirectionGroup",
  emits: ["update:modelValue"],
  setup(_, { emit }) {
    return () => h("button", { class: "direction-stub", onClick: () => emit("update:modelValue", "top-left") }, "direction");
  },
});

const FrameStub = defineComponent({
  name: "BorderAndFrameControls",
  emits: ["update"],
  setup(_, { emit }) {
    return () => h("button", { class: "frame-stub", onClick: () => emit("update", { borderEnabled: true, frame: "safari" }) }, "frame");
  },
});

const clip = (overrides: Record<string, unknown> = {}) => ({
  id: "clip-1",
  kind: "screen",
  name: "Screen",
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  isLinked: true,
  shadowSize: "md",
  shadowColor: "#000000",
  shadowDirection: "bottom",
  cornerRadius: "sm",
  borderEnabled: false,
  clipTransform: { x: 0, y: 0, width: 1, height: 0.5 },
  ...overrides,
});

const mountPanel = (selectedClip: ReturnType<typeof clip> | null = clip()) => mount(ClipPropertiesPanel, {
  props: { selectedClip },
  global: {
    stubs: {
      BigSlider: BigSliderStub,
      Switch: SwitchStub,
      ColorPicker: ColorPickerStub,
      ShadowDirectionGroup: ShadowDirectionStub,
      BorderAndFrameControls: FrameStub,
    },
  },
});

describe("ClipPropertiesPanel", () => {
  it("renders the empty state when no clip is selected", () => {
    const wrapper = mountPanel(null);
    expect(wrapper.find(".empty-state").exists()).toBe(true);
    expect(wrapper.text()).toContain("No clip selected");
  });

  it("updates placement, radius, shadow, mirror, frame, speed and destructive actions", async () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll(".slider-stub")).toHaveLength(4);
    await wrapper.findAll(".slider-stub")[0].trigger("click");
    await wrapper.findAll(".slider-stub")[1].trigger("click");
    await wrapper.findAll(".slider-stub")[2].trigger("click");
    expect(wrapper.emitted("update:clipTransform")).toEqual([
      [{ x: 0.1, y: 0, width: 1, height: 0.5 }],
      [{ x: 0, y: 0.1, width: 1, height: 0.5 }],
      [{ x: 0, y: 0, width: 1.1, height: 0.55 }],
    ]);

    const reset = wrapper.findAll("button").find((button) => button.text().toLowerCase().includes("reset"));
    await reset!.trigger("click");
    expect(wrapper.emitted("reset:clipTransform")).toHaveLength(1);

    const custom = wrapper.findAll("button").find((button) => button.text().toLowerCase() === "custom");
    await custom!.trigger("click");
    expect(wrapper.emitted("update:cornerRadius")).toContainEqual(["32"]);
    await wrapper.findAll(".slider-stub").find((slider) => slider.text().toLowerCase().includes("radius"))!.trigger("click");
    expect(wrapper.emitted("update:cornerRadius")).toContainEqual(["42"]);

    const shadowNone = wrapper.findAll("button").filter((button) => button.text().toLowerCase() === "none")[1];
    await shadowNone!.trigger("click");
    expect(wrapper.emitted("update:shadow")).toContainEqual([{ size: "none", color: "#000000", direction: "bottom" }]);
    const shadowSoft = wrapper.findAll("button").find((button) => button.text().toLowerCase() === "soft");
    await shadowSoft!.trigger("click");
    await wrapper.get(".direction-stub").trigger("click");
    await wrapper.get(".color-stub").trigger("click");
    expect(wrapper.emitted("update:shadow")).toContainEqual([{ size: "sm", color: "#abcdef", direction: "top-left" }]);

    await wrapper.findAll(".switch-stub")[0].trigger("click");
    expect(wrapper.emitted("update:isMirrored")).toContainEqual([true]);
    await wrapper.get(".frame-stub").trigger("click");
    expect(wrapper.emitted("update:appearance")).toContainEqual([{ borderEnabled: true, frame: "safari" }]);
    await wrapper.get(".preset-pill").trigger("click");
    expect(wrapper.emitted("update:playbackRate")).toContainEqual([0.5]);

    await wrapper.findAll("button").find((button) => button.text() === "Unlink")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text().includes("Delete Clip"))!.trigger("click");
    expect(wrapper.emitted("unlink")).toHaveLength(1);
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });

  it("normalizes old radius values and renders only applicable control groups", async () => {
    const wrapper = mountPanel(clip({ kind: "audio", cornerRadius: "full", clipTransform: undefined, isLinked: false }));
    expect(wrapper.find(".section-block").exists()).toBe(true);
    expect(wrapper.find(".preset-pill").exists()).toBe(false);
    expect(wrapper.findAll(".slider-stub")).toHaveLength(0);
    await wrapper.setProps({ selectedClip: clip({ kind: "image", cornerRadius: "41px", shadowSize: "none", clipTransform: undefined }) });
    await nextTick();
    expect(wrapper.findAll(".slider-stub")).toHaveLength(1);
    expect(wrapper.find(".direction-stub").exists()).toBe(false);
    expect(wrapper.find(".color-stub").exists()).toBe(false);
  });

  it("clamps placement values and ignores placement events without a transform", async () => {
    const wrapper = mountPanel(clip({ clipTransform: { x: 0, y: 0, width: 3.9, height: 3.9 } }));
    await wrapper.get(".slider-stub").trigger("click");
    expect(wrapper.emitted("update:clipTransform")?.[0]).toEqual([{ x: 0.1, y: 0, width: 3.9, height: 3.9 }]);

    await wrapper.setProps({ selectedClip: clip({ clipTransform: undefined }) });
    await nextTick();
    expect(wrapper.findAll(".slider-stub")).toHaveLength(1);
  });
});
