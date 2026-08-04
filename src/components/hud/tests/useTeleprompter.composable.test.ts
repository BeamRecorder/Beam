import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTeleprompter } from "../teleprompter/useTeleprompter";
import type { TeleprompterDocument } from "../teleprompter/teleprompter-types";

const captureMock = vi.hoisted(() => ({
  getSessionTeleprompter: vi.fn(),
  saveSessionTeleprompter: vi.fn(),
}));
vi.mock("~/api/capture", () => ({ capture: captureMock }));

const session = { projectId: "project", sessionId: "session" };
const storedDocument = (): TeleprompterDocument => ({
  schemaVersion: 1,
  text: "stored one\nstored two",
  mode: "line-by-line",
  autoscroll: false,
  scrollSpeed: 30,
  fontSize: 40,
  lineHeight: 1.4,
  textAlign: "center",
  theme: "dark",
  updatedAtUtc: "yesterday",
});

describe("useTeleprompter composable", () => {
  let api!: ReturnType<typeof useTeleprompter>;
  let wrapper: ReturnType<typeof mount>;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    captureMock.getSessionTeleprompter.mockResolvedValue(null);
    captureMock.saveSessionTeleprompter.mockResolvedValue(storedDocument());
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
    wrapper = mount(
      defineComponent({
        setup() {
          api = useTeleprompter();
          return () => null;
        },
      }),
    );
  });

  afterEach(() => {
    wrapper.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const display = () => {
    const element = document.createElement("section");
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(element, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    element.scrollTo = vi.fn();
    return element;
  };

  it("loads a new or stored session and handles persisted errors", async () => {
    await api.applySession(session);
    await flushPromises();
    expect(captureMock.getSessionTeleprompter).toHaveBeenCalledWith(
      "project",
      "session",
    );
    expect(captureMock.saveSessionTeleprompter).toHaveBeenCalledWith(
      "project",
      "session",
      expect.objectContaining({ schemaVersion: 1 }),
    );

    captureMock.getSessionTeleprompter.mockResolvedValueOnce(storedDocument());
    await api.applySession(session);
    await flushPromises();
    expect(api.document.value).toEqual(storedDocument());
    expect(api.lines.value).toEqual(["stored one", "stored two"]);

    captureMock.getSessionTeleprompter.mockRejectedValueOnce(
      new Error("session unavailable"),
    );
    await api.applySession(session);
    expect(api.error.value).toBe("session unavailable");
    await api.applySession(null);
    expect(api.session.value).toBeNull();
  });

  it("updates and saves the document, handles shortcuts and reports save failures", async () => {
    await api.applySession(session);
    await flushPromises();
    captureMock.saveSessionTeleprompter.mockRejectedValueOnce(
      new Error("write failed"),
    );
    api.updateDocument({
      text: "one\ntwo\nthree",
      mode: "line-by-line",
      autoscroll: true,
    });
    vi.advanceTimersByTime(350);
    await flushPromises();
    expect(api.lines.value).toEqual(["one", "two", "three"]);
    expect(api.error.value).toBe("write failed");

    api.handleShortcut("teleprompter.nextLine");
    api.handleShortcut("teleprompter.nextLine");
    expect(api.activeLine.value).toBe(2);
    api.handleShortcut("teleprompter.previousLine");
    expect(api.activeLine.value).toBe(1);
    api.handleShortcut("teleprompter.toggleAutoscroll");
    expect(api.document.value.autoscroll).toBe(false);
    api.handleShortcut("unknown");
  });

  it("autoscrolls continuously and by line, scrolls the active line, pauses and resumes", async () => {
    const target = display();
    api.updateDocument({
      text: "first\nsecond\nthird",
      mode: "continuous",
      autoscroll: true,
      scrollSpeed: 100,
    });
    api.setDisplayElement(target);
    expect(frames).toHaveLength(1);
    frames.shift()!(100);
    frames.shift()!(200);
    expect(target.scrollTop).toBeGreaterThan(0);

    api.togglePause();
    expect(api.isPaused.value).toBe(true);
    api.togglePause();
    expect(api.isPaused.value).toBe(false);

    api.updateDocument({
      mode: "line-by-line",
      autoscroll: true,
      scrollSpeed: 200,
    });
    const line = document.createElement("p");
    line.dataset.lineIndex = "1";
    Object.defineProperty(line, "offsetTop", { configurable: true, value: 80 });
    target.append(line);
    api.setDisplayElement(target);
    expect(target.scrollTo as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    api.nextLine();
    expect(api.activeLine.value).toBe(1);
    expect(target.scrollTo).toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(api.activeLine.value).toBe(2);
    api.previousLine();
    expect(target.scrollTo).toHaveBeenCalled();
  });

  it("does not autoscroll when disabled and saves during unmount cleanup", async () => {
    api.updateDocument({ autoscroll: false });
    api.setDisplayElement(display());
    expect(frames).toHaveLength(0);
    await api.applySession(session);
    await flushPromises();
    wrapper.unmount();
    await flushPromises();
    expect(captureMock.saveSessionTeleprompter).toHaveBeenCalled();
  });
});
