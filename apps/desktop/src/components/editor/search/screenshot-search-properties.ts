import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { EditorPropertyGroup } from './editor-search-types';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';

export function screenshotSearchPropertyAvailable(
  state: ScreenshotState | null,
  id: string | null,
  group: EditorPropertyGroup,
  key: string,
): boolean {
  if (!state) return false;
  if (group.namespace === 'SettingsPanel') return !['recorderTool', 'devToolsTool', 'themeMode'].includes(key);
  if (group.namespace === 'CanvasPanel' && group.tab === 'canvas') {
    if (['video', 'removeBackground'].includes(key)) return false;
    if (key === 'watermark') return true;
    if (key.startsWith('watermark') || key === 'showBeamLogo') return Boolean(state.canvas.watermark?.enabled);
    return state.canvas.showBackground;
  }
  if (group.namespace === 'ClipPropertiesPanel') {
    if (['speedBoost', 'playbackSpeed', 'crop', 'mirrorHorizontally', 'mirrorVertically'].includes(key)) return false;
    const image = screenshotImage(state, id);
    if (!image) return false;
    const appearance = image.appearance;
    if (key === 'shadowBlur') return appearance?.shadowSize === 'custom';
    if (key === 'shadowColor') return appearance?.shadowSize !== 'none' && appearance?.shadowMode !== 'adaptive';
    if (key === 'direction') return appearance?.shadowSize !== 'none';
    return true;
  }
  const shape = state.shapes.find((layer) => layer.id === id);
  if (group.namespace === 'CaptionClipPanel' || (group.namespace === 'Elements' && group.section === 'text'))
    return Boolean(shape?.text);
  if (group.namespace === 'Elements') return key !== 'shapeLibrary' && Boolean(shape?.drawing);
  if (group.namespace === 'CanvasPanel' && shape) {
    if (['colorLayerOpacity', 'colorLayerCornerRadius', 'shapePreset'].includes(key)) return false;
    if (key === 'shapeFamily') return ['shape', 'arrow'].includes(shape.family);
    if (key === 'shapeCornerRadius') return shape.family === 'shape' && shape.preset === 'rounded-rectangle';
    if (key.startsWith('arrow')) return shape.family === 'arrow';
    if (key === 'fillColor') return !['text', 'drawing'].includes(shape.family);
    if (['shadowBlur', 'shadowColor'].includes(key)) return shape.family !== 'text' && shape.shadowEnabled;
    if (['colorLayerShadow', 'borderColor', 'borderWidth'].includes(key)) return shape.family !== 'text';
    if (key === 'colorLayerBackdropBlur') return !['text', 'drawing'].includes(shape.family) && shape.opacityEnabled;
    return true;
  }
  const cursor = state.cursors?.find((layer) => layer.id === id);
  if (group.namespace === 'CursorPanel')
    return Boolean(cursor && (!['shadowBlur', 'shadowColor', 'direction'].includes(key) || cursor.shadowEnabled));
  const effect = state.effects?.find((layer) => layer.id === id);
  if (group.namespace === 'Highlight') return effect?.mode === 'highlight';
  if (group.namespace === 'BlurPropertiesPanel') {
    if (!effect) return false;
    if (key === 'mode') return effect?.mode !== 'highlight';
    if (key === 'strength') return false;
    if (key === 'blurRadius') return effect?.mode === 'blur';
    if (key === 'frostIntensity') return effect?.mode === 'frosted';
    if (key === 'pixelSize') return effect?.mode === 'pixelated';
    if (key === 'tintOpacity') return effect?.mode === 'frosted';
    if (key === 'color') return ['frosted', 'opaque'].includes(effect?.mode ?? '');
    if (key === 'cornerRadius') return effect?.shape !== 'circle';
  }
  return true;
}
