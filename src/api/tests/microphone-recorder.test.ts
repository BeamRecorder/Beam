import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listBrowserMicrophones,
  microphoneDeviceId,
  normalizedMicrophoneSetting,
} from "../microphone-recorder";

const mediaDevices = navigator.mediaDevices;

afterEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices,
  });
});

describe("microphone recorder helpers", () => {
  it.each([
    ["microphone:chromium:default", "default"],
    ["microphone:chromium:usb-2", "usb-2"],
    ["microphone:chromium:opaque/device", "opaque/device"],
  ])("extracts the Chromium device id from %s", (sourceId, expected) => {
    expect(microphoneDeviceId(sourceId)).toBe(expected);
  });

  it.each(["", "microphone:1", "camera:chromium:device"])(
    "rejects an invalid microphone source id",
    (sourceId) => {
      expect(() => microphoneDeviceId(sourceId)).toThrow(
        "selected microphone is invalid",
      );
    },
  );

  it.each([
    [48_000, 48_000],
    [1.6, 2],
    [undefined, 0],
    [-1, 0],
    [Number.NaN, 0],
  ])("normalizes reported device setting %s", (value, expected) => {
    expect(normalizedMicrophoneSetting(value)).toBe(expected);
  });

  it("lists Chromium microphone ids, labels, and a default device", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "videoinput", deviceId: "camera", label: "Camera" },
          { kind: "audioinput", deviceId: "default", label: "" },
          { kind: "audioinput", deviceId: "usb", label: "USB microphone" },
        ]),
      },
    });
    await expect(listBrowserMicrophones()).resolves.toEqual([
      {
        id: "microphone:chromium:default",
        kind: "microphone",
        label: "Microphone 1",
        isDefault: true,
      },
      {
        id: "microphone:chromium:usb",
        kind: "microphone",
        label: "USB microphone",
        isDefault: false,
      },
    ]);
  });

  it("reports unavailable microphone discovery instead of returning a fake device", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    await expect(listBrowserMicrophones()).rejects.toThrow(
      "Microphone discovery is unavailable",
    );
  });
});
