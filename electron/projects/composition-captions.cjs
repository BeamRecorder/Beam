const keyboardModifiers = new Set(['control', 'shift', 'alt', 'meta']);
const keyboardPlatforms = new Set(['windows', 'macos', 'linux']);
const keyboardKeys = new Set([
  ...'abcdefghijklmnopqrstuvwxyz',
  ...Array.from({ length: 10 }, (_, index) => `digit${index}`),
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'escape',
  'enter',
  'tab',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'page-up',
  'page-down',
  'space',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;

const normalizeCaptionStyle = (value) => {
  const style = value || {};
  if (
    typeof style.color !== 'string' ||
    !finite(style.fontSize) ||
    typeof style.wrap !== 'boolean' ||
    typeof style.shadowColor !== 'string' ||
    !finite(style.shadowBlur) ||
    !finite(style.backdropBlur) ||
    typeof style.outlineColor !== 'string' ||
    !finite(style.outlineWidth) ||
    !finite(style.extrusionDepth) ||
    !['top', 'center', 'bottom'].includes(style.placement)
  )
    throw new Error('Style de caption invalide');
  return {
    color: style.color,
    fontSize: Math.max(1, style.fontSize),
    wrap: style.wrap,
    shadowColor: style.shadowColor,
    shadowBlur: Math.max(0, style.shadowBlur),
    backdropBlur: Math.max(0, Math.min(48, style.backdropBlur)),
    outlineColor: style.outlineColor,
    outlineWidth: Math.max(0, Math.min(30, style.outlineWidth)),
    extrusionDepth: Math.max(0, Math.min(20, style.extrusionDepth)),
    placement: style.placement,
    ...(typeof style.shadowDirection === 'string' ? { shadowDirection: style.shadowDirection } : {}),
    ...(finite(style.shadowOffsetX) ? { shadowOffsetX: style.shadowOffsetX } : {}),
    ...(finite(style.shadowOffsetY) ? { shadowOffsetY: style.shadowOffsetY } : {}),
    ...(typeof style.customText === 'string' ? { customText: style.customText } : {}),
  };
};

const normalizeTextCaption = (value) => {
  if (!Array.isArray(value.sentences)) throw new Error('Caption texte invalide');
  const sentences = value.sentences.map((sentence) => {
    if (!sentence || !id(sentence.id) || !Array.isArray(sentence.words)) throw new Error('Phrase de caption invalide');
    const words = sentence.words.map((word) => {
      if (
        !word ||
        typeof word.text !== 'string' ||
        !finite(word.startMs) ||
        !finite(word.endMs) ||
        word.endMs < word.startMs
      )
        throw new Error('Mot de caption invalide');
      return {
        text: word.text,
        startMs: Math.max(0, Math.round(word.startMs)),
        endMs: Math.max(0, Math.round(word.endMs)),
      };
    });
    return {
      id: sentence.id,
      text: typeof sentence.text === 'string' ? sentence.text : words.map((word) => word.text).join(' '),
      startMs: finite(sentence.startMs) ? Math.max(0, Math.round(sentence.startMs)) : (words[0]?.startMs ?? 0),
      endMs: finite(sentence.endMs) ? Math.max(0, Math.round(sentence.endMs)) : (words.at(-1)?.endMs ?? 0),
      words,
    };
  });
  return { type: 'text', sentences, style: normalizeCaptionStyle(value.style) };
};

const normalizeKeyboardCaption = (value) => {
  if (
    !Array.isArray(value.steps) ||
    typeof value.followCursor !== 'boolean' ||
    !keyboardPlatforms.has(value.recordedPlatform) ||
    !id(value.sourceSessionId)
  )
    throw new Error('Caption clavier invalide');
  let previousOffset = -1;
  const steps = value.steps.map((step) => {
    if (
      !step ||
      !finite(step.offsetMs) ||
      step.offsetMs < 0 ||
      step.offsetMs < previousOffset ||
      !Array.isArray(step.modifiers) ||
      step.modifiers.some((modifier) => !keyboardModifiers.has(modifier)) ||
      new Set(step.modifiers).size !== step.modifiers.length ||
      !keyboardKeys.has(step.key)
    )
      throw new Error('Étape de caption clavier invalide');
    previousOffset = Math.round(step.offsetMs);
    return { offsetMs: previousOffset, modifiers: [...step.modifiers], key: step.key };
  });
  if (!steps.length) throw new Error('Caption clavier vide');
  return {
    type: 'keyboard',
    steps,
    followCursor: value.followCursor,
    recordedPlatform: value.recordedPlatform,
    sourceSessionId: value.sourceSessionId,
    style: normalizeCaptionStyle(value.style),
  };
};

const normalizeCaption = (value) => {
  if (!value || typeof value !== 'object') throw new Error('Caption invalide');
  if (value.type === 'text') return normalizeTextCaption(value);
  if (value.type === 'keyboard') return normalizeKeyboardCaption(value);
  throw new Error('Type de caption invalide');
};

module.exports = { normalizeCaption };
