const { createMediaSegmentStorage, registerMediaSegmentIpc } = require('./media-segment-storage.cjs')

function cameraFormat(value) {
  if (!value || typeof value !== 'object' || value.codec !== 'vp8') throw new Error('Invalid camera format.')
  for (const [key, name] of [
    ['width', 'Camera width'],
    ['height', 'Camera height'],
    ['nominalFps', 'Camera fps'],
  ])
    if (!Number.isSafeInteger(value[key]) || value[key] <= 0) throw new Error(`${name} must be a positive integer.`)
  const appearance = value.appearance
  if (
    appearance !== undefined &&
    (!appearance ||
      !['none', 'sm', 'md', 'lg'].includes(appearance.shadowSize) ||
      !['none', 'sm', 'md', 'lg', 'full'].includes(appearance.cornerRadius))
  )
    throw new Error('Invalid camera appearance.')
  const placement = value.placement
  if (
    placement !== undefined &&
    (!placement ||
      !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(placement[key])) ||
      placement.width <= 0 ||
      placement.height <= 0)
  )
    throw new Error('Invalid camera placement.')
  const normalizedPlacement =
    placement &&
    (() => {
      const width = Math.max(0.001, Math.min(1, placement.width))
      const height = Math.max(0.001, Math.min(1, placement.height))
      return {
        x: Math.max(0, Math.min(1 - width, placement.x)),
        y: Math.max(0, Math.min(1 - height, placement.y)),
        width,
        height,
      }
    })()
  return {
    mediaType: 'video',
    codec: 'vp8',
    width: value.width,
    height: value.height,
    nominalFps: value.nominalFps,
    ...(appearance ? { appearance: { shadowSize: appearance.shadowSize, cornerRadius: appearance.cornerRadius } } : {}),
    ...(normalizedPlacement ? { placement: normalizedPlacement } : {}),
  }
}

function createCameraStorage(options) {
  return createMediaSegmentStorage({
    kind: 'camera',
    sourcePrefix: 'camera:chromium:',
    normalizeFormat: cameraFormat,
    ...options,
  })
}

function registerCameraIpc({ ipcMain, storage }) {
  registerMediaSegmentIpc({ ipcMain, storage, channel: 'camera' })
}

module.exports = { createCameraStorage, registerCameraIpc }
