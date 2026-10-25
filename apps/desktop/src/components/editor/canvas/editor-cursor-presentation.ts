import type { EditorCanvasProps } from './editor-canvas-types';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import { screenCursorPresentation } from '@beam/engine/capture/screen-cursor-settings';

export function editorCursorPresentation(props: EditorCanvasProps, screen: VisualClip | null) {
  const settings = screenCursorPresentation(screen, {
    enabled: true,
    selection: props.cursorSelection,
    size: props.cursorSize,
    color: props.cursorColor,
    shadow: {
      enabled: props.enableShadow,
      blur: props.shadowBlur,
      color: props.shadowColor,
      direction: props.shadowDirection,
    },
    motion: props.motion,
    clickEffects: props.clickEffects,
    autoHide: props.autoHide,
  });
  const selection = props.cursorPreviewSelection ?? settings.selection;
  const pack =
    props.cursorPack?.id === selection.packId
      ? props.cursorPack
      : (props.cursorPacks?.find((pack) => pack.id === selection.packId) ?? null);
  return { settings: { ...settings, selection }, pack };
}
