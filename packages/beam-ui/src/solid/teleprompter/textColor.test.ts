import { describe, expect, it } from 'vitest'
import { resolvedTextColor } from './textColor'

describe('teleprompter text contrast', () => {
  it('follows the current foreground for automatic scripts', () => {
    const document = { textColor: '#12345680', useThemeTextColor: true }
    expect(resolvedTextColor(document, '#16161a')).toBe('#16161a')
    expect(resolvedTextColor(document, '#f5f5f7')).toBe('#f5f5f7')
  })
  it('preserves explicitly chosen white and its opacity', () => {
    for (const textColor of ['#ffffffff', '#ffffff40', '#12345600']) {
      expect(resolvedTextColor({ textColor, useThemeTextColor: false }, '#16161a')).toBe(textColor)
    }
  })
  it('migrates only the original opaque white default to theme contrast', () => {
    for (const useThemeTextColor of [undefined, null]) {
      expect(resolvedTextColor({ textColor: '#FFFFFFFF', useThemeTextColor }, '#16161a')).toBe('#16161a')
      expect(resolvedTextColor({ textColor: '#fedcba80', useThemeTextColor }, '#16161a')).toBe('#fedcba80')
      expect(resolvedTextColor({ textColor: '#ffffff80', useThemeTextColor }, '#16161a')).toBe('#ffffff80')
    }
  })
})
