const SHADOW = 10;
const POINTER = 6;

function validateSettingsAnchor(anchor, bar) {
  if (
    !anchor ||
    ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) ||
    anchor.x < 0 ||
    anchor.y < 0 ||
    anchor.width <= 0 ||
    anchor.height <= 0 ||
    anchor.x + anchor.width > bar.width ||
    anchor.y + anchor.height > bar.height
  )
    throw new TypeError('Invalid Quick Snip settings anchor.');
  return { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height };
}

function settingsLayout(bar, area, contentHeight, anchor) {
  const width = Math.min(266 + SHADOW * 2, area.width);
  const height = Math.min(contentHeight + SHADOW * 2 + POINTER, area.height);
  const center = bar.x + anchor.x + anchor.width / 2;
  const x = Math.max(area.x, Math.min(center - width + 38, area.x + area.width - width));
  const above = bar.y + anchor.y - height;
  const below = bar.y + anchor.y + anchor.height;
  const side = above >= area.y || below + height > area.y + area.height ? 'above' : 'below';
  const y = Math.max(area.y, Math.min(side === 'above' ? above : below, area.y + area.height - height));
  return {
    bounds: { x: Math.round(x), y: Math.round(y), width, height },
    side,
    anchorX: Math.max(SHADOW + 16, Math.min(center - Math.round(x), width - SHADOW - 16)),
  };
}

module.exports = { validateSettingsAnchor, settingsLayout };
