const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applySpellCheckPreferences,
  resolveSpellCheckerLanguage,
} = require('../../electron/preferences/spell-check.cjs');

const session = (availableSpellCheckerLanguages) => {
  const calls = [];
  return {
    availableSpellCheckerLanguages,
    calls,
    setSpellCheckerEnabled(value) {
      calls.push(['enabled', value]);
    },
    setSpellCheckerLanguages(value) {
      calls.push(['languages', value]);
    },
  };
};

test('resolves exact spell-check languages case-insensitively', () => {
  assert.equal(resolveSpellCheckerLanguage('fr-FR', ['de-DE', 'FR-fr']), 'FR-fr');
  assert.equal(resolveSpellCheckerLanguage('EN-us', ['en-US']), 'en-US');
});

test('resolves the base English locale to the preferred en-US dictionary', () => {
  assert.equal(resolveSpellCheckerLanguage('en', ['en-GB', 'en-US']), 'en-US');
});

test('does not confuse zh-TW with zh-CN', () => {
  assert.equal(resolveSpellCheckerLanguage('zh-TW', ['zh-CN']), null);
  assert.equal(resolveSpellCheckerLanguage('zh-TW', ['zh-CN', 'zh-TW']), 'zh-TW');
});

test('returns no language when the requested dictionary is absent', () => {
  assert.equal(resolveSpellCheckerLanguage('es', ['en-US', 'fr-FR']), null);
});

test('disables spell check when the preference is disabled on every platform', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const electronSession = session(['en-US']);

    const result = applySpellCheckPreferences({
      electronSession,
      preferences: { spellCheck: { enabled: false }, extras: { locale: 'en' } },
      platform,
    });

    assert.deepEqual(result, { enabled: false, language: null, reason: 'disabled' });
    assert.deepEqual(electronSession.calls, [['enabled', false]]);
  }
});

test('configures and enables a supported language on Windows and Linux', () => {
  for (const platform of ['win32', 'linux']) {
    const electronSession = session(['en-US', 'fr-FR']);

    const result = applySpellCheckPreferences({
      electronSession,
      preferences: { spellCheck: { enabled: true }, extras: { locale: 'en' } },
      platform,
    });

    assert.deepEqual(result, { enabled: true, language: 'en-US', reason: 'configured' });
    assert.deepEqual(electronSession.calls, [
      ['languages', ['en-US']],
      ['enabled', true],
    ]);
  }
});

test('disables spell check when Windows or Linux has no matching dictionary', () => {
  for (const platform of ['win32', 'linux']) {
    const electronSession = session(['en-US']);

    const result = applySpellCheckPreferences({
      electronSession,
      preferences: { spellCheck: { enabled: true }, extras: { locale: 'vi' } },
      platform,
    });

    assert.deepEqual(result, { enabled: false, language: null, reason: 'unsupported-language' });
    assert.deepEqual(electronSession.calls, [['enabled', false]]);
  }
});

test('leaves dictionary selection to the native macOS spell checker', () => {
  const electronSession = session(['en-US', 'fr-FR']);

  const result = applySpellCheckPreferences({
    electronSession,
    preferences: { spellCheck: { enabled: true }, extras: { locale: 'fr-FR' } },
    platform: 'darwin',
  });

  assert.deepEqual(result, { enabled: true, language: null, reason: 'native' });
  assert.deepEqual(electronSession.calls, [['enabled', true]]);
});
