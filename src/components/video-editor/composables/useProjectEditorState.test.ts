import { nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OUTPUT_CANVAS } from "../canvas/output-canvas";
import { emptyComposition } from "../composition/composition-types";
import { createDefaultCursorClickEffects } from "../../../api/types/cursor-settings";
import type { ProjectEditorState } from "../../../api/types/capture-api";
import type { BackgroundMedia, BackgroundValue } from "./backgroundCatalog";
import type { ZoomElement } from "../zoom/zoom-types";
import { beginPropertyInteraction, endPropertyInteraction, resetPropertyInteractions } from "../../../composables/property-interaction";

const mocks = vi.hoisted(() => ({ saveProjectEditorState: vi.fn() }));
vi.mock("../../../api/capture", () => ({ capture: mocks }));

import { useProjectEditorState } from "./useProjectEditorState";

const createState = () => {
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
    availableBackgrounds: ref<Array<{ items: BackgroundMedia[] }>>([]),
  };
};

describe("useProjectEditorState property persistence", () => {
  afterEach(() => {
    resetPropertyInteractions();
    vi.useRealTimers();
    mocks.saveProjectEditorState.mockReset();
  });

  it("waits for a property interaction to end before saving", async () => {
    vi.useFakeTimers();
    const state = createState();
    const editor = useProjectEditorState(state);

    beginPropertyInteraction();
    state.cursorEffects.value.left.springIntensity = 80;
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.saveProjectEditorState).not.toHaveBeenCalled();

    endPropertyInteraction();
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.saveProjectEditorState).toHaveBeenCalledOnce();
    expect(mocks.saveProjectEditorState.mock.calls[0][1].presentation.cursorEffects.left.springIntensity).toBe(80);
    expect(editor.isSaving.value).toBe(false);
  });
});
