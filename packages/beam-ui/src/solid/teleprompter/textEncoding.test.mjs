import assert from 'node:assert/strict'
import { test } from 'node:test'
import { utf8ByteLength } from './textEncoding.ts'

test('native scripts count ASCII, accents, emoji and empty content in UTF-8', () => {
  for (const text of ['', 'Bonjour', 'Été', '你好', '🚀', 'a\ud800b', '\udc00'])
    assert.equal(utf8ByteLength(text), Buffer.byteLength(text))
})
test('the script limit counts bytes rather than UTF-16 characters', () => {
  assert.equal(utf8ByteLength('é'.repeat(24 * 1024)), 48 * 1024)
  assert.equal(utf8ByteLength('🚀'.repeat(12 * 1024)), 48 * 1024)
  assert.equal(utf8ByteLength('🚀'.repeat(12 * 1024) + 'x'), 48 * 1024 + 1)
})
