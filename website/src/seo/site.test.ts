import { describe, expect, it } from 'vitest';
import { absoluteSiteUrl, canonicalUrl } from './site';

describe('site URLs', () => {
  it('keeps the canonical homepage slash', () => {
    expect(canonicalUrl('/')).toBe('https://beam.plinka.eu/');
  });

  it('normalizes leading and trailing slashes', () => {
    expect(canonicalUrl('///faq///')).toBe('https://beam.plinka.eu/faq');
  });

  it('preserves nested clean paths', () => {
    expect(canonicalUrl('/docs/getting-started')).toBe('https://beam.plinka.eu/docs/getting-started');
  });

  it('resolves public assets against the production origin', () => {
    expect(absoluteSiteUrl('/Beam-showcase.png')).toBe('https://beam.plinka.eu/Beam-showcase.png');
  });
});
