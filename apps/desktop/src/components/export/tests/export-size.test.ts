import { describe, expect, it } from 'vitest';
import { formatExportSize } from '../export-size';

describe('localized export size', () => {
  it.each([null, NaN, Infinity, -1])('shows an unavailable value for %s', (bytes) => {
    expect(formatExportSize(bytes, 'en')).toBe('—');
  });
  it('selects decimal units and avoids false precision', () => {
    expect(formatExportSize(1234, 'en')).toBe('1.2 kB');
    expect(formatExportSize(1_234_567, 'en')).toBe('1.2 MB');
    expect(formatExportSize(1_234_567_890, 'en')).toBe('1.2 GB');
    expect(formatExportSize(0, 'en')).toBe('0 kB');
  });
  it('uses the user locale for numbers and units', () => {
    expect(formatExportSize(1_234_567, 'fr')).toMatch(/^1,2\sMo$/);
  });
});
