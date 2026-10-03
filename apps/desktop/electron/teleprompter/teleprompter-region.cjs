function regionRectangle(options) {
  const { bounds, region } = options || {};
  if (
    !bounds ||
    !region ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]) && Number.isFinite(region[key])) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > 1 ||
    region.y + region.height > 1
  )
    throw new Error('Invalid teleprompter region.');
  return {
    x: bounds.x + region.x * bounds.width,
    y: bounds.y + region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height,
  };
}
function placeOutsideRegion(windowBounds, options, displays) {
  const crop = regionRectangle(options);
  const gap = 16;
  const areas = displays
    .flatMap(({ bounds }) => {
      const right = bounds.x + bounds.width;
      const bottom = bounds.y + bounds.height;
      const cutLeft = Math.max(bounds.x, Math.min(right, crop.x - gap));
      const cutRight = Math.max(bounds.x, Math.min(right, crop.x + crop.width + gap));
      const cutTop = Math.max(bounds.y, Math.min(bottom, crop.y - gap));
      const cutBottom = Math.max(bounds.y, Math.min(bottom, crop.y + crop.height + gap));
      return [
        {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: cutTop - bounds.y,
        },
        {
          x: bounds.x,
          y: cutBottom,
          width: bounds.width,
          height: bottom - cutBottom,
        },
        {
          x: bounds.x,
          y: bounds.y,
          width: cutLeft - bounds.x,
          height: bounds.height,
        },
        {
          x: cutRight,
          y: bounds.y,
          width: right - cutRight,
          height: bounds.height,
        },
      ];
    })
    .filter((area) => area.width >= 240 && area.height >= 140);
  const contains = (area) =>
    windowBounds.x >= area.x &&
    windowBounds.y >= area.y &&
    windowBounds.x + windowBounds.width <= area.x + area.width &&
    windowBounds.y + windowBounds.height <= area.y + area.height;
  if (areas.some(contains)) return windowBounds;
  const area = areas.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!area)
    throw new Error(
      'Make the recording region smaller or use another display to keep the teleprompter outside the Linux recording.',
    );
  const width = Math.round(Math.min(windowBounds.width, area.width));
  const height = Math.round(Math.min(windowBounds.height, area.height));
  return {
    x: Math.ceil(Math.max(area.x, Math.min(windowBounds.x, area.x + area.width - width))),
    y: Math.ceil(Math.max(area.y, Math.min(windowBounds.y, area.y + area.height - height))),
    width,
    height,
  };
}
module.exports = { regionRectangle, placeOutsideRegion };
