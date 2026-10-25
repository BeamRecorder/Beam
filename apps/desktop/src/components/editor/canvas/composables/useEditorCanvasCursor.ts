import { computed } from 'vue';
import { editorCursorPresentation } from '../editor-cursor-presentation';
import type { EditorCanvasProps } from '../editor-canvas-types';
import type { EditorCanvasCursorOptions } from './editor-canvas-cursor-types';
import { useCursorOverlay } from './useCursorOverlay';
import { inject } from 'vue';
import { screenCursorEnabled } from '@beam/engine/capture/screen-cursor';
import { customCursorKey } from '../../properties/cursor/custom-cursor-context';
export function useEditorCanvasCursor(props: EditorCanvasProps, options: EditorCanvasCursorOptions) {
  const enabled = inject(customCursorKey, null);
  const resolved = computed(() => editorCursorPresentation(props, options.screenClip()));
  return useCursorOverlay({
    enabled: () => screenCursorEnabled(options.screenClip(), enabled?.value !== false),
    cursorSelection: () => resolved.value.settings.selection,
    cursorPack: () => resolved.value.pack,
    cursorSize: () => resolved.value.settings.size,
    cursorColor: () => resolved.value.settings.color,
    enableShadow: () => resolved.value.settings.shadow.enabled,
    clickEffects: () => resolved.value.settings.clickEffects,
    motion: () => resolved.value.settings.motion,
    autoHide: () => resolved.value.settings.autoHide,
    shadowBlur: () => resolved.value.settings.shadow.blur,
    shadowColor: () => resolved.value.settings.shadow.color,
    shadowDirection: () => resolved.value.settings.shadow.direction,
    outputCanvas: () => props.outputCanvas,
    deviceScale: options.deviceScale,
    currentTime: () => props.currentTime,
    isPlaying: () => props.isPlaying,
    editorData: () => props.editorData,
    composition: () => props.composition,
    screenClip: options.screenClip,
    isScreenEnabled: () => Boolean(options.screenClip() && options.hasScreenFrame()),
    showBackground: () => props.outputCanvas.showBackground,
    onRenderOnce: options.renderOnce,
  });
}
