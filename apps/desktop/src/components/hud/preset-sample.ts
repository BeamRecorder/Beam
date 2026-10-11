/** Explicitly illustrative source used only by the preset preview. No source/device access. */
export function presetSample(surface: string, text: string, accent: string) {
  const source = document.createElement('canvas');
  source.width = 960;
  source.height = 600;
  const context = source.getContext('2d');
  if (!context) throw new Error('Preset sample canvas unavailable');
  context.fillStyle = surface;
  context.fillRect(0, 0, 960, 600);
  context.fillStyle = accent;
  context.beginPath();
  context.roundRect(76, 80, 76, 76, 20);
  context.fill();
  context.fillStyle = text;
  context.font = '500 80px sans-serif';
  context.fillText('Beam', 76, 290);
  context.globalAlpha = 0.35;
  for (const [y, width] of [
    [345, 540],
    [383, 410],
    [465, 650],
  ]) {
    context.beginPath();
    context.roundRect(76, y!, width!, 13, 6);
    context.fill();
  }
  return source;
}
