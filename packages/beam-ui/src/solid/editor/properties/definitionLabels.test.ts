import { expect, it } from 'vitest';
import { definitionLabel } from './definitionLabels';

it('localizes builtin metadata with valid message IDs and preserves extension labels', () => {
  expect(definitionLabel('Color correction', key => `fr:${key}`)).toBe('fr:descriptorColorCorrection');
  expect(definitionLabel('Follow cursor', key => key)).toBe('descriptorFollowCursor');
  expect(definitionLabel('My external shader', () => 'unexpected')).toBe('My external shader');
  expect(definitionLabel('toString', () => 'unexpected')).toBe('toString');
});
