import { expect, it } from 'vitest'
import { measuredReaderProgress } from './playbackLayout'

const content = { width: 500, height: 1000 }, viewport = { width: 400, height: 200 }
it('preserves reading progress after a viewport or font change', () => {
  expect(measuredReaderProgress(content, viewport, { current: 150, maximum: 600 }, false)).toEqual({ current: 200, maximum: 800 })
  expect(measuredReaderProgress(content, { ...viewport, height: 600 }, { current: 150, maximum: 600 }, false)).toEqual({ current: 100, maximum: 400 })
})
it('has no scroll range for empty or fitting text', () => {
  for (const height of [0, 100, 200]) expect(measuredReaderProgress({ ...content, height }, viewport,
    { current: 300, maximum: 800 }, false)).toEqual({ current: 0, maximum: 0 })
})
it('preserves the initial offset and restarts only when explicitly requested at the end', () => {
  expect(measuredReaderProgress(content, viewport, { current: 850, maximum: 0 }, false).current).toBe(800)
  expect(measuredReaderProgress(content, viewport, { current: 600, maximum: 600 }, false).current).toBe(800)
  expect(measuredReaderProgress(content, viewport, { current: 600, maximum: 600 }, true).current).toBe(0)
})
it.each([0, -1, NaN, Infinity])('rejects content and viewport widths %s', width => {
  expect(() => measuredReaderProgress({ ...content, width }, viewport, { current: 0, maximum: 0 }, false)).toThrow('layout bounds')
  expect(() => measuredReaderProgress(content, { ...viewport, width }, { current: 0, maximum: 0 }, false)).toThrow('layout bounds')
})
it.each([-1, NaN, Infinity])('rejects content height %s', height => {
  expect(() => measuredReaderProgress({ ...content, height }, viewport, { current: 0, maximum: 0 }, false)).toThrow('layout bounds')
})
it.each([0, -1, NaN, Infinity])('rejects viewport height %s', height => {
  expect(() => measuredReaderProgress(content, { ...viewport, height }, { current: 0, maximum: 0 }, false)).toThrow('layout bounds')
})
