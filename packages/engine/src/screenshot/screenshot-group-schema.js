export function validateScreenshotGroups(layers) {
  const counts = new Map();
  for (const layer of layers) {
    if (layer.groupId === undefined) continue;
    if (
      typeof layer.groupId !== 'string' ||
      !layer.groupId.trim() ||
      layer.groupId.length > 200 ||
      ['__background__', '__watermark__'].includes(layer.id)
    )
      throw new TypeError('Invalid screenshot group.');
    counts.set(layer.groupId, (counts.get(layer.groupId) || 0) + 1);
  }
  if ([...counts.values()].some((count) => count < 2))
    throw new TypeError('A screenshot group requires at least two layers.');
}
