// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import manifest from '../../recordly/upstream.json';
import reference from './fixtures/reference.json';

it('pins the copied implementation and oracle to the same audited upstream revision', () => {
  expect(manifest.revision).toBe('0ea5bd753050874a6d157cab818489aa398d6161');
  expect(reference.source.revision).toBe(manifest.revision);
  expect(manifest.license).toBe('AGPL-3.0');
});
it.each(manifest.files)('retains the audited source bytes for $path', (entry) => {
  const bytes = readFileSync(new URL('../../recordly/' + entry.path, import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.localSha256);
  if (entry.adaptation === 'none') expect(entry.localSha256).toBe(entry.sourceSha256);
  expect(bytes.toString().split('\n').length).toBeLessThanOrEqual(501);
});
