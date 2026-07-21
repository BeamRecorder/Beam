const assert = require('node:assert/strict')
const test = require('node:test')

const { clampOverlayBounds, previewOffset } = require('../electron/camera/overlay-bounds.cjs')

const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

test('keeps overlay bounds unchanged when they fit the display', () => {
  assert.deepEqual(clampOverlayBounds({ x: 120, y: 80, width: 224, height: 184 }, workArea), {
    x: 120, y: 80, width: 224, height: 184,
  })
})

test('moves an expanded overlay left and up instead of overflowing the display', () => {
  assert.deepEqual(clampOverlayBounds({ x: 1700, y: 900, width: 390, height: 300 }, workArea), {
    x: 1530, y: 780, width: 390, height: 300,
  })
})

test('limits an overlay larger than the available work area', () => {
  assert.deepEqual(clampOverlayBounds({ x: -20, y: -40, width: 2400, height: 1200 }, workArea), {
    x: 0, y: 0, width: 1920, height: 1080,
  })
})

test('returns the inverse native displacement for the preview', () => {
  assert.deepEqual(previewOffset({ x: 1700, y: 900 }, { x: 1530, y: 780 }), { x: 170, y: 120 })
})
