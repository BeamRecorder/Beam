const CAMERA_WINDOW_PADDING = 64

function clampOverlayBounds(bounds, workArea) {
  const width = Math.min(bounds.width, workArea.width)
  const height = Math.min(bounds.height, workArea.height)

  return {
    x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height)),
    width,
    height,
  }
}

function previewOffset(originalBounds, expandedBounds) {
  return {
    x: originalBounds.x - expandedBounds.x,
    y: originalBounds.y - expandedBounds.y,
  }
}

module.exports = { CAMERA_WINDOW_PADDING, clampOverlayBounds, previewOffset }
