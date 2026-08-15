const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeInputSidecar, recordedPlatform } = require('../electron/projects/input-sidecar.cjs');

const sidecarWith = (event) => ({ version: 1, events: [event] });

test('normalizes a valid input sidecar without mutating it', () => {
  const input = {
    version: 1,
    events: [
      { event: 'mouse-button', sessionNs: 0, button: 1, pressed: true },
      {
        event: 'shortcut',
        sessionNs: 1_234_567,
        pressed: true,
        modifiers: ['control', 'shift'],
        key: 'digit0',
      },
      {
        event: 'shortcut',
        sessionNs: 2_000_000,
        pressed: false,
        modifiers: ['control', 'shift'],
        key: 'arrow-left',
      },
    ],
  };
  const before = structuredClone(input);

  const normalized = normalizeInputSidecar(input);

  assert.deepEqual(normalized, input);
  assert.deepEqual(input, before);
  assert.notStrictEqual(normalized.events, input.events);
  assert.notStrictEqual(normalized.events[1].modifiers, input.events[1].modifiers);
});

test('rejects absent sidecars and unsupported versions', () => {
  for (const value of [null, undefined, {}, { version: 2, events: [] }, { version: 1, events: null }]) {
    assert.throws(() => normalizeInputSidecar(value), /Sidecar input invalide/);
  }
});

test('rejects invalid timestamps and event envelopes', () => {
  for (const sessionNs of [-1, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, 1.5]) {
    assert.throws(
      () =>
        normalizeInputSidecar(
          sidecarWith({
            event: 'shortcut',
            sessionNs,
            pressed: true,
            modifiers: [],
            key: 'a',
          }),
        ),
      /Timestamp input invalide/,
    );
  }

  for (const event of [
    null,
    { event: 'shortcut', sessionNs: 0, modifiers: [], key: 'a' },
    { event: 'unknown', sessionNs: 0, pressed: true, modifiers: [], key: 'a' },
  ]) {
    assert.throws(() => normalizeInputSidecar(sidecarWith(event)), /Événement input invalide|Raccourci input invalide/);
  }
});

test('rejects invalid modifiers, keys, and mouse buttons', () => {
  for (const event of [
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: ['command'], key: 'a' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: ['control', 'control'], key: 'a' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: 'control', key: 'a' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: [], key: 'unknown' },
    { event: 'shortcut', sessionNs: 0, pressed: true, modifiers: [], key: 'A' },
    { event: 'mouse-button', sessionNs: 0, button: -1, pressed: true },
    { event: 'mouse-button', sessionNs: 0, button: 32, pressed: true },
  ]) {
    assert.throws(() => normalizeInputSidecar(sidecarWith(event)), /Raccourci input invalide|Bouton input invalide/);
  }
});

test('normalizes recorded platforms and rejects unknown values', () => {
  assert.equal(recordedPlatform('windows'), 'windows');
  assert.equal(recordedPlatform('macos'), 'macos');
  assert.equal(recordedPlatform('linux'), 'linux');
  assert.equal(recordedPlatform('freebsd'), null);
  assert.equal(recordedPlatform(undefined), null);
});
