import { expect, it } from 'vitest';
import { parseColorHex } from '../color-hex';
it.each([
  ['#AB12EF', '#ab12ef'],
  ['abc', '#aabbcc'],
  [' #123456 ', '#123456'],
  ['#000', '#000000'],
  ['ffffff', '#ffffff'],
])('normalizes %s', (input, output) => expect(parseColorHex(input)).toBe(output));
it.each(['', 'red', '#gggggg', '#1234', '#12345678', '##123456', 'rgb(0,0,0)'])(
  'rejects %s without changing an authored color',
  (input) => expect(parseColorHex(input)).toBeNull(),
);
