import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capture } = vi.hoisted(() => ({
  capture: {
    configureCameraOverlay: vi.fn(),
    startCameraPreview: vi.fn(),
    stopCameraPreview: vi.fn(),
  },
}));
vi.mock("../../../api/capture", () => ({ capture }));

import CameraPreviewOverlay from "./CameraPreviewOverlay.vue";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  capture.startCameraPreview.mockResolvedValue({ url: "http://127.0.0.1:4242/" });
  capture.stopCameraPreview.mockResolvedValue(undefined);
  Object.defineProperty(window, "capture", {
    configurable: true,
    value: capture,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete window.capture;
});

describe("CameraPreviewOverlay", () => {
  it("loads a native camera preview and cleans it up", async () => {
    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: "camera:nokhwa:0", isHovered: true },
    });
    await vi.runAllTimersAsync();
    await vi.waitFor(() =>
      expect(capture.startCameraPreview).toHaveBeenCalledWith("camera:nokhwa:0"),
    );
    expect(wrapper.get(".camera-overlay-container").classes()).toContain(
      "is-hovered",
    );
    expect(wrapper.find(".camera-overlay-skeleton").exists()).toBe(false);
    expect(wrapper.get(".camera-overlay-video").attributes("src")).toBe(
      "http://127.0.0.1:4242/",
    );

    wrapper.unmount();
    await vi.waitFor(() => expect(capture.stopCameraPreview).toHaveBeenCalled());
  });

  it("does not request the disabled camera and shows hardware errors", async () => {
    const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: "off" } });
    await vi.runAllTimersAsync();
    expect(capture.startCameraPreview).not.toHaveBeenCalled();

    capture.startCameraPreview.mockRejectedValueOnce(new Error("native camera unavailable"));
    await wrapper.setProps({ cameraId: "camera:chromium:broken" });
    await vi.waitFor(() =>
      expect(wrapper.find(".camera-overlay-error").exists()).toBe(true),
    );
    expect(capture.configureCameraOverlay).toHaveBeenCalledWith({
      cameraId: "off",
    });
    wrapper.unmount();
  });

  it("stops a stale stream when the selected camera changes while loading", async () => {
    let resolveRequest!: (value: { url: string }) => void;
    capture.startCameraPreview.mockImplementationOnce(
      () => new Promise<{ url: string }>((resolve) => { resolveRequest = resolve; }),
    );
    const wrapper = mount(CameraPreviewOverlay, {
      props: { cameraId: "camera:nokhwa:0" },
    });
    await vi.runAllTimersAsync();
    await wrapper.setProps({ cameraId: "off" });
    resolveRequest({ url: "http://127.0.0.1:4242/" });
    await vi.waitFor(() => expect(capture.stopCameraPreview).toHaveBeenCalled());
    wrapper.unmount();
  });
});
