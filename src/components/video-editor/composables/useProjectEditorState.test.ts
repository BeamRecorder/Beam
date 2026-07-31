import { nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OUTPUT_CANVAS } from "../canvas/output-canvas";
import { emptyComposition } from "../composition/composition-types";
import { createDefaultCursorClickEffects } from "../../../api/types/cursor-settings";
import type { ProjectEditorState } from "../../../api/types/capture-api";
import type { BackgroundMedia, BackgroundValue } from "./backgroundCatalog";
import type { ZoomElement } from "../zoom/zoom-types";

const mocks = vi.hoisted(() => ({ saveProjectEditorState: vi.fn() }));
vi.mock("../../../api/capture", () => ({ capture: mocks }));

import { useProjectEditorState } from "./useProjectEditorState";

const createState = () => {
  const cursorEffectsEditing = ref(false);
  return {
    project: ref({ id: "project", name: "Project", createdAt: "", updatedAt: "", sessionCount: 0, previewSrc: null }),
    composition: ref(emptyComposition()),
    zoomElements: ref<ZoomElement[]>([]),
    generatedSessions: ref<ProjectEditorState["zoom"]["generatedSessions"]>([]),
    importedBackgrounds: ref<BackgroundMedia[]>([]),
    selectedBackground: ref<BackgroundValue | null>(null),
    backgroundBlurPercent: ref(0),
    canvas: ref({ ...DEFAULT_OUTPUT_CANVAS }),
    cursorEffects: ref(createDefaultCursorClickEffects()),
    cursorEffectsEditing,
    availableBackgrounds: ref<Array<{ items: BackgroundMedia[] }>>([]),
  };
};

describe("useProjectEditorState cursor effect persistence", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.saveProjectEditorState.mockReset();
  });

  it("waits for the click-effect slider to end before saving", async () => {
    vi.useFakeTimers();
    const state = createState();
    const editor = useProjectEditorState(state);

    state.cursorEffectsEditing.value = true;
    state.cursorEffects.value.left.springIntensity = 80;
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.saveProjectEditorState).not.toHaveBeenCalled();

    state.cursorEffectsEditing.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.saveProjectEditorState).toHaveBeenCalledOnce();
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.cursorEffects.left.springIntensity).toBe(80);
    expect(editor.isSaving.value).toBe(false);
  });
});
