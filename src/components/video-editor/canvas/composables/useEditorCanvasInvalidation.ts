import { watch } from 'vue';
import type { EditorCanvasProps } from '../editor-canvas-types';

export function useEditorCanvasInvalidation(options: {
  props: Readonly<EditorCanvasProps>;
  transformDraft: () => unknown;
  renderOnce: () => void;
  resetCamera: () => void;
}) {
  watch(() => options.props.outputCanvas, options.renderOnce, { deep: true });
  watch(
    () => options.props.composition,
    () => {
      options.resetCamera();
      options.renderOnce();
    },
    { deep: true },
  );
  watch(
    () => [options.props.currentTime, options.props.frameVersion] as const,
    () => {
      if (!options.props.isPlaying) options.renderOnce();
    },
  );
  watch(() => options.props.isCropping, options.renderOnce);
  watch(() => options.props.editorData?.cursor.telemetry, options.resetCamera, { deep: true });
  watch(() => [options.props.zoomElements, options.props.selectedZoom] as const, options.resetCamera, { deep: true });
  watch(
    () =>
      [
        options.props.cursorSelection,
        options.props.cursorPack,
        options.props.cursorSize,
        options.props.cursorColor,
        options.props.enableShadow,
        options.props.shadowBlur,
        options.props.shadowColor,
        options.props.shadowDirection,
        options.props.clickEffects,
        options.props.motion,
        options.props.autoHide,
      ] as const,
    options.renderOnce,
    { deep: true },
  );
  watch(options.transformDraft, options.renderOnce, { deep: true });
}
