import { ref } from 'vue';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { emptyComposition, type Clip } from '~/media/shared/composition-types';
import {
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
} from '../../../../api/types/cursor-settings';
import type { CaptureProject, ProjectEditorState } from '../../../../api/types/capture-api';
import type { CursorSelection } from '../../../../api/types/cursor-pack';
import type { BackgroundMedia, BackgroundValue } from '../backgroundCatalog';
import { DEFAULT_ZOOM_MOTION_BLUR, type ZoomElement } from '../../zoom/zoom-types';
import { createDefaultCursorPresentation } from '../../../../api/types/cursor-presentation';
import type { EditorPreferenceDefaults } from '../editor-default-types';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';

export const createState = () => {
  const cursor = createDefaultCursorPresentation();
  return {
    project: ref<CaptureProject | null | undefined>({
      id: 'project',
      name: 'Project',
      createdAt: '',
      updatedAt: '',
      sessionCount: 0,
      previewSrc: null,
    }),
    composition: ref(emptyComposition()),
    zoomElements: ref<ZoomElement[]>([]),
    generatedSessions: ref<ProjectEditorState['zoom']['generatedSessions']>([]),
    zoomMotionBlur: ref({ ...DEFAULT_ZOOM_MOTION_BLUR }),
    importedBackgrounds: ref<BackgroundMedia[]>([]),
    selectedBackground: ref<BackgroundValue | null>(null),
    backgroundBlurPercent: ref(0),
    canvas: ref({ ...DEFAULT_OUTPUT_CANVAS }),
    cursorEffects: ref(createDefaultCursorClickEffects()),
    cursorMotion: ref(createDefaultCursorMotionSettings()),
    cursorAutoHide: ref({ ...cursor.autoHide }),
    cursorSelection: ref<CursorSelection>({ ...cursor.selection }),
    cursorSize: ref(cursor.size),
    cursorColor: ref(cursor.color),
    cursorShadowEnabled: ref(cursor.shadow.enabled),
    cursorShadowBlur: ref(cursor.shadow.blur),
    cursorShadowColor: ref(cursor.shadow.color),
    cursorShadowDirection: ref(cursor.shadow.direction),
    availableBackgrounds: ref<Array<{ items: BackgroundMedia[] }>>([]),
    editorDefaults: ref<EditorPreferenceDefaults>(normalizeEditorPreferenceDefaults(undefined)),
    selectedClip: ref<Clip | null>(null),
    selectedZoom: ref<ZoomElement | null>(null),
  };
};
