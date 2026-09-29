/** Built-in descriptor labels are localized; extension authors retain their declared labels. */
const labels: Record<string, string> = {
  'Color correction': 'ColorCorrection', Brightness: 'Brightness', Saturation: 'Saturation',
  Contrast: 'Contrast', Hue: 'Hue', Transform: 'Transform',
  'Horizontal scale': 'HorizontalScale', 'Vertical scale': 'VerticalScale',
  'Horizontal position': 'HorizontalPosition', 'Vertical position': 'VerticalPosition',
  Rotation: 'Rotation', 'Horizontal anchor': 'HorizontalAnchor', 'Vertical anchor': 'VerticalAnchor',
  Opacity: 'Opacity', Volume: 'Volume', Crossfade: 'Crossfade', 'Wipe left': 'WipeLeft',
  'Solid color': 'SolidColor', Color: 'Color', Cursor: 'Cursor', 'Camera zoom': 'CameraZoom',
  Scale: 'Scale', Center: 'Center', 'Follow cursor': 'FollowCursor', Entry: 'Entry', Exit: 'Exit',
  Motion: 'Motion', 'Cursor overlay': 'CursorOverlay', 'Size multiplier': 'SizeMultiplier', 'Click pulse': 'ClickPulse',
  'Warm colors':'WarmColors','Fade in':'FadeIn','Fade out':'FadeOut','Centered crop':'CenteredCrop','Voice boost':'VoiceBoost',
};
export function definitionLabel(label: string, translate: (key: string) => string): string {
  return Object.hasOwn(labels, label) ? translate(`descriptor${labels[label]}`) : label;
}
