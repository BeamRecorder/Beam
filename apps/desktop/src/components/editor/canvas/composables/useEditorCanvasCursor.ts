import type { EditorCanvasProps } from '../editor-canvas-types';
import type { EditorCanvasCursorOptions } from './editor-canvas-cursor-types';
import { useCursorOverlay } from './useCursorOverlay';
import { inject } from 'vue';
import { customCursorKey } from '../../properties/cursor/custom-cursor-context';
export function useEditorCanvasCursor(props: EditorCanvasProps, options: EditorCanvasCursorOptions) {
  const enabled = inject(customCursorKey, null);
  return useCursorOverlay({
    enabled: () => enabled?.value !== false,
    cursorSelection: () => props.cursorSelection,
    cursorPack: () => props.cursorPack,
    cursorSize: () => props.cursorSize,
    cursorColor: () => props.cursorColor,
    enableShadow: () => props.enableShadow,
    clickEffects: () => props.clickEffects,
    motion: () => props.motion,
    autoHide: () => props.autoHide,
    shadowBlur: () => props.shadowBlur,
    shadowColor: () => props.shadowColor,
    shadowDirection: () => props.shadowDirection,
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
