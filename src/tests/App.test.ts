import { nextTick } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.vue";

const mocks = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    setInteractive: vi.fn(),
    setCameraOverlayActive: vi.fn(),
    setWindowMode: vi.fn(),
    setSize: vi.fn(),
    showHud: vi.fn(),
    present: vi.fn(),
    listProjects: vi.fn(),
    getProjectEditorData: vi.fn(),
  },
  controller: {
    recording: undefined as any,
    onComplete: undefined as ((session: { videoSrc?: string | null }) => void) | undefined,
  },
}));

vi.mock("../api/capture", () => ({ capture: mocks.capture }));

vi.mock("../components/hud/recorder/useRecordingController", async () => {
  const { ref } = await import("vue");
  return {
    useRecordingController: (onComplete: (session: { videoSrc?: string | null }) => void) => {
      const recording = {
        phase: ref("idle"),
        secondsRemaining: ref(0),
        recordingTime: ref("00:00.0"),
        cameraEnabled: ref(false),
        microphoneEnabled: ref(false),
        systemAudioEnabled: ref(false),
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
        togglePause: vi.fn(),
        toggleCamera: vi.fn(),
        toggleMicrophone: vi.fn(),
        toggleSystemAudio: vi.fn(),
      };
      mocks.controller.recording = recording;
      mocks.controller.onComplete = onComplete;
      return recording;
    },
  };
});

vi.mock("../components/hud/HUD.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({
    name: "MockHud",
    emits: ["start-recording", "open-project"],
    setup(_, { emit }) {
      return () => h("div", { class: "mock-hud" }, [
        h("button", { class: "start", onClick: () => emit("start-recording", { screenKind: "display", cameraId: "off", microphoneId: "no-audio", systemAudio: false, targetFps: 30, countdownSeconds: 0, recordingBarVisibility: "always" }) }),
        h("button", { class: "open", onClick: () => emit("open-project", { id: "project-1", name: "Project", previewSrc: "project.mp4" }) }),
      ]);
    },
  }) };
});
vi.mock("../components/hud/recorder/RecorderBar.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({
    name: "MockRecorderBar",
    props: { visibility: { type: String, default: "" } },
    emits: ["stop", "cancel", "pause", "camera", "microphone", "system-audio"],
    setup(_, { emit }) {
      return () => h("div", { class: "mock-recorder" }, [
        h("button", { class: "stop", onClick: () => emit("stop") }),
        h("button", { class: "cancel", onClick: () => emit("cancel") }),
        h("button", { class: "pause", onClick: () => emit("pause") }),
        h("button", { class: "camera", onClick: () => emit("camera") }),
        h("button", { class: "microphone", onClick: () => emit("microphone") }),
        h("button", { class: "system-audio", onClick: () => emit("system-audio") }),
      ]);
    },
  }) };
});
vi.mock("../components/video-editor/VideoEditor.vue", async () => {
  const { defineComponent, h } = await import("vue");
  const component = defineComponent({
    name: "MockVideoEditor",
    emits: ["back-to-hud", "open-project"],
    setup(_, { emit }) {
      return () => h("div", { class: "mock-editor" }, [
        h("button", { class: "back", onClick: () => emit("back-to-hud") }),
        h("button", { class: "open-other", onClick: () => emit("open-project", { id: "other", name: "Other", previewSrc: "other.mp4" }) }),
      ]);
    },
  });
  return { __esModule: true, __isTeleport: false, default: Object.assign(component, { __isTeleport: false }) };
});
vi.mock("../components/hud/camera/CameraOverlayApp.vue", async () => ({ default: (await import("vue")).defineComponent({ template: "<div />" }) }));
vi.mock("../components/hud/camera/CameraShadowApp.vue", async () => ({ default: (await import("vue")).defineComponent({ template: "<div />" }) }));
vi.mock("../components/hud/teleprompter/TeleprompterWindowApp.vue", async () => ({ default: (await import("vue")).defineComponent({ template: "<div />" }) }));
vi.mock("../components/ui/toast/ToastProvider.vue", async () => ({ default: (await import("vue")).defineComponent({ template: "<div />" }) }));

const project = { id: "project-1", name: "Project", previewSrc: "project.mp4" };
const editorData = { composition: {}, zoom: {}, presentation: {} };

let wrapper!: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => document.body) });
  mocks.capture.getPreferences.mockResolvedValue({ recordingBar: { visibility: "auto-fade" } });
  mocks.capture.listProjects.mockResolvedValue([project]);
  mocks.capture.getProjectEditorData.mockResolvedValue(editorData);
  wrapper = mount(App, {
    global: {
      stubs: { Transition: false },
    },
  });
  mocks.controller.recording.start.mockImplementation(async () => { mocks.controller.recording.phase.value = "recording"; });
  mocks.controller.recording.cancel.mockImplementation(async () => { mocks.controller.recording.phase.value = "idle"; });
});

afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

const settle = async () => {
  await flushPromises();
  await nextTick();
};

describe("App", () => {
  it("loads HUD preferences and reports interactive mouse regions", async () => {
    await settle();
    expect(wrapper.find(".mock-hud").exists()).toBe(true);
    expect(mocks.capture.getPreferences).toHaveBeenCalled();

    const button = wrapper.get("button").element;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(button);
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent("mouseleave"));
    expect(mocks.capture.setInteractive).toHaveBeenNthCalledWith(1, true);
    expect(mocks.capture.setInteractive).toHaveBeenLastCalledWith(false);
  });

  it("starts recording, routes recorder controls, and returns to HUD on cancel", async () => {
    await wrapper.get(".start").trigger("click");
    await settle();
    expect(mocks.capture.setWindowMode).toHaveBeenCalledWith("recorder");
    expect(mocks.controller.recording.start).toHaveBeenCalled();

    await wrapper.get(".pause").trigger("click");
    await wrapper.get(".camera").trigger("click");
    await wrapper.get(".microphone").trigger("click");
    await wrapper.get(".system-audio").trigger("click");
    expect(mocks.controller.recording.togglePause).toHaveBeenCalled();
    expect(mocks.controller.recording.toggleCamera).toHaveBeenCalled();
    expect(mocks.controller.recording.toggleMicrophone).toHaveBeenCalled();
    expect(mocks.controller.recording.toggleSystemAudio).toHaveBeenCalled();

    await wrapper.get(".cancel").trigger("click");
    await settle();
    expect(mocks.controller.recording.cancel).toHaveBeenCalled();
    expect(mocks.capture.showHud).toHaveBeenCalled();
    expect(wrapper.find(".mock-hud").exists()).toBe(true);
  });

  it("opens projects, displays loading errors, and dismisses them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.capture.getProjectEditorData.mockRejectedValueOnce(new Error("project is unreadable"));
    await wrapper.get(".open").trigger("click");
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain("project is unreadable");
    await wrapper.get('[role="alert"] button').trigger("click");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    mocks.capture.getProjectEditorData.mockResolvedValueOnce(editorData);
    await wrapper.get(".open").trigger("click");
    await settle();
    expect(wrapper.find(".mock-editor").exists()).toBe(true);
    expect(mocks.capture.present).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("handles completed recordings, missing projects, and editor back navigation", async () => {
    mocks.capture.listProjects.mockResolvedValueOnce([project]);
    mocks.capture.getProjectEditorData.mockResolvedValueOnce(editorData);
    mocks.controller.onComplete?.({ videoSrc: "project.mp4" });
    await settle();
    expect(wrapper.find(".mock-editor").exists()).toBe(true);

    vi.useFakeTimers();
    await wrapper.get(".back").trigger("click");
    vi.advanceTimersByTime(180);
    await settle();
    expect(mocks.capture.showHud).toHaveBeenCalled();
    expect(wrapper.find(".mock-hud").exists()).toBe(true);

    mocks.capture.listProjects.mockResolvedValueOnce([]);
    mocks.controller.onComplete?.({ videoSrc: "missing.mp4" });
    await settle();
    expect(wrapper.find(".mock-editor").exists()).toBe(true);
  });

  it("returns immediately after an idle start and ignores mouse events outside the HUD", async () => {
    mocks.controller.recording.start.mockImplementation(async () => { mocks.controller.recording.phase.value = "idle"; });
    await wrapper.get(".start").trigger("click");
    await settle();
    expect(mocks.capture.showHud).toHaveBeenCalled();
    expect(mocks.capture.setCameraOverlayActive).toHaveBeenCalledWith(true);

    vi.spyOn(document, "elementFromPoint").mockReturnValue(document.body);
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 2, clientY: 2 }));
    expect(mocks.capture.setInteractive).not.toHaveBeenCalledWith(true);
  });
});
