const normalizeLanguageCode = (value) =>
  String(value || '')
    .replaceAll('_', '-')
    .toLowerCase();

const preferredVariants = {
  en: 'en-US',
  pt: 'pt-BR',
  zh: 'zh-CN',
};

function resolveSpellCheckerLanguage(locale, availableLanguages) {
  const normalizedLocale = normalizeLanguageCode(locale);
  if (!normalizedLocale) return null;
  const available = Array.isArray(availableLanguages)
    ? availableLanguages.filter((value) => typeof value === 'string')
    : [];
  const exact = available.find((value) => normalizeLanguageCode(value) === normalizedLocale);
  if (exact) return exact;

  if (normalizedLocale.includes('-')) return null;

  const base = normalizedLocale.split('-')[0];
  const preferred = preferredVariants[base];
  if (preferred) {
    const preferredMatch = available.find((value) => normalizeLanguageCode(value) === normalizeLanguageCode(preferred));
    if (preferredMatch) return preferredMatch;
  }
  return available.find((value) => normalizeLanguageCode(value).split('-')[0] === base) ?? null;
}

function applySpellCheckPreferences({ electronSession, preferences, platform, systemLocale }) {
  const requested = preferences?.spellCheck?.enabled !== false;
  if (!requested) {
    electronSession.setSpellCheckerEnabled(false);
    return { enabled: false, language: null, reason: 'disabled' };
  }

  if (platform === 'darwin') {
    electronSession.setSpellCheckerEnabled(true);
    return { enabled: true, language: null, reason: 'native' };
  }

  const locale = typeof preferences?.extras?.locale === 'string' ? preferences.extras.locale : systemLocale;
  const language = resolveSpellCheckerLanguage(locale, electronSession.availableSpellCheckerLanguages);
  if (!language) {
    electronSession.setSpellCheckerEnabled(false);
    return { enabled: false, language: null, reason: 'unsupported-language' };
  }

  electronSession.setSpellCheckerLanguages([language]);
  electronSession.setSpellCheckerEnabled(true);
  return { enabled: true, language, reason: 'configured' };
}

module.exports = { applySpellCheckPreferences, resolveSpellCheckerLanguage };
