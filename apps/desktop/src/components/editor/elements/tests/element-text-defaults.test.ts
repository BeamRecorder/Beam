import { describe, expect, it } from 'vitest';
import { createElementText } from '@beam/engine/shared/element-text';
import { elementTextFromDefaults, normalizeElementTextDefaults } from '../element-text-defaults';

describe('element text preference normalization', () => {
  it('retains typography, padding and alignment without retaining text content', () => {
    const text = createElementText('Previous recording');
    text.style = { ...text.style, color: '#000000', fontSize: 64, fontFamily: 'Inter', customText: 'Stale text' };
    text.padding = 12;
    text.verticalAlign = 'top';
    const saved = normalizeElementTextDefaults(text)!;
    expect(saved).toMatchObject({
      style: { color: '#000000', fontSize: 64, fontFamily: 'Inter' },
      padding: 12,
      verticalAlign: 'top',
    });
    expect(saved).not.toHaveProperty('content');
    expect(saved.style).not.toHaveProperty('customText');
    saved.style.shape.color = '#123456';
    expect(text.style.shape.color).not.toBe('#123456');
  });

  it.each([
    null,
    undefined,
    [],
    'invalid',
    {},
    { ...createElementText(), padding: 41 },
    { ...createElementText(), style: { color: '#000000' } },
  ])('rejects invalid persisted preferences: %j', (value) => {
    expect(normalizeElementTextDefaults(value)).toBeUndefined();
  });

  it('round-trips saved styles without adding text or sharing nested objects', () => {
    const text = createElementText();
    text.style.fontAssetId = 'b'.repeat(64);
    const first = normalizeElementTextDefaults(text)!;
    const restored = normalizeElementTextDefaults(JSON.parse(JSON.stringify(first)));
    expect(restored).toEqual(first);
    expect(restored!.style.wordHighlight).not.toBe(first.style.wordHighlight);
  });
});

describe('new element text', () => {
  it('uses built-in defaults for installations without a saved style', () => {
    expect(elementTextFromDefaults('New text', undefined)).toEqual(createElementText('New text'));
  });

  it('uses the saved black text style with the new content', () => {
    const original = createElementText('Old text');
    original.style.color = '#000000';
    const saved = normalizeElementTextDefaults(original)!;
    expect(elementTextFromDefaults('New text', saved)).toEqual({ ...saved, content: 'New text' });
    expect(elementTextFromDefaults('', saved).content).toBe('');
  });

  it('keeps the saved style and consecutive new elements independent', () => {
    const saved = normalizeElementTextDefaults(createElementText())!;
    const first = elementTextFromDefaults('First', saved);
    const second = elementTextFromDefaults('Second', saved);
    first.style.shape.color = '#000000';
    expect(second.style.shape.color).toBe(saved.style.shape.color);
    expect(second.style.shape).not.toBe(saved.style.shape);
  });
});
