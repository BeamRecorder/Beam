import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { i18n } from "~/i18n";
import SidecarLink from "./SidecarLink.vue";

const links = [{ id: "microphone", kind: "microphone" as const, name: "Microphone", enabled: true }];

const mountLink = () => mount(SidecarLink, {
  props: { links },
  global: {
    plugins: [i18n],
    stubs: {
      Popover: { template: '<div><slot name="trigger" /><slot :close="() => {}" /></div>' },
      Button: { props: ["ariaLabel"], template: '<button :aria-label="ariaLabel"><slot /></button>' },
    },
  },
});

describe("SidecarLink", () => {
  it("renders linked tracks and their status", () => {
    const wrapper = mountLink();
    expect(wrapper.text()).toContain("Linked tracks");
    expect(wrapper.text()).toContain("Microphone");
    expect(wrapper.text()).toContain("Enabled");
  });

  it("selects a linked track", async () => {
    const wrapper = mountLink();
    await wrapper.get(".sidecar-target").trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual([links[0]]);
  });

  it("emits an independent unlink action", async () => {
    const wrapper = mountLink();
    await wrapper.get('button[aria-label="Unlink Microphone"]').trigger("click");
    expect(wrapper.emitted("unlink")?.[0]).toEqual([links[0]]);
  });
});
