import { describe, expect, it } from 'vitest'
import { useColorPicker } from './useColorPicker'

const picker = useColorPicker()
describe('useColorPicker', () => {
  it('converts valid and invalid hexadecimal colors', () => { expect(picker.hexToRgb('#aBc123')).toEqual({ r: 171, g: 193, b: 35 }); expect(picker.hexToRgb('bad')).toEqual({ r: 0, g: 0, b: 0 }) })
  it('rounds RGB values when encoding hexadecimal colors', () => { expect(picker.rgbToHex(0, 15.6, 255)).toBe('#0010ff') })
  it.each([[255, 0, 0, { h: 0, s: 100, v: 100 }], [0, 0, 0, { h: 0, s: 0, v: 0 }], [128, 128, 128, { h: 0, s: 0, v: 50.19607843137255 }]])('converts RGB %o to HSV', (r, g, b, expected) => expect(picker.rgbToHsv(r, g, b)).toEqual(expected))
  it.each([[0, 100, 100, { r: 255, g: 0, b: 0 }], [120, 100, 100, { r: 0, g: 255, b: 0 }], [240, 100, 100, { r: 0, g: 0, b: 255 }], [0, 0, 50, { r: 128, g: 128, b: 128 }]])('converts HSV %o/%o/%o to RGB', (h, s, v, expected) => expect(picker.hsvToRgb(h, s, v)).toEqual(expected))
})
