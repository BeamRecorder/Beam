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

const defaultWordHighlight = () => ({
  enabled: false,
  displayMode: 'sentence',
  fill: 'solid',
  color: '#facc15',
  gradient: {
    type: 'linear',
    angle: 90,
    stops: [
      { id: 'highlight-start', position: 0, color: '#facc15', alpha: 1 },
      { id: 'highlight-end', position: 1, color: '#fb7185', alpha: 1 },
    ],
  },
  effect: 'pop',
  intensity: 55,
  inactiveOpacity: 72,
});

const normalizeWordHighlight = (value) => {
  const fallback = defaultWordHighlight();
  const highlight = value && typeof value === 'object' ? value : {};
  const gradient = highlight.gradient && typeof highlight.gradient === 'object' ? highlight.gradient : {};
  const stops = Array.isArray(gradient.stops)
    ? gradient.stops.flatMap((stop, index) =>
        stop && typeof stop.color === 'string' && finite(stop.position) && stop.position >= 0 && stop.position <= 1
          ? [
              {
                id: id(stop.id) ? stop.id : `highlight-stop-${index}`,
                position: stop.position,
                color: stop.color,
                alpha: finite(stop.alpha) ? Math.max(0, Math.min(1, stop.alpha)) : 1,
              },
            ]
          : [],
      )
    : [];
  const validGradient = stops.length >= 2;
  return {
    enabled: highlight.enabled === true,
    displayMode: highlight.displayMode === 'word' ? 'word' : 'sentence',
    fill: highlight.fill === 'gradient' ? 'gradient' : 'solid',
    color: typeof highlight.color === 'string' ? highlight.color : fallback.color,
    gradient: {
      type: validGradient && gradient.type === 'radial' ? 'radial' : fallback.gradient.type,
      angle:
        validGradient && finite(gradient.angle) ? Math.max(0, Math.min(360, gradient.angle)) : fallback.gradient.angle,
      stops: validGradient ? stops : fallback.gradient.stops,
    },
    effect: ['none', 'pop', 'jump', 'pulse'].includes(highlight.effect) ? highlight.effect : fallback.effect,
    intensity: finite(highlight.intensity) ? Math.max(0, Math.min(100, highlight.intensity)) : fallback.intensity,
    inactiveOpacity: finite(highlight.inactiveOpacity)
      ? Math.max(0, Math.min(100, highlight.inactiveOpacity))
      : fallback.inactiveOpacity,
  };
};

const normalizeCaptionShape = (value, legacyBlur) => {
  const hasShape = value && typeof value === 'object';
  const shape = hasShape ? value : {};
  const preset = ['square', 'rounded', 'pill', 'custom'].includes(shape.preset)
    ? shape.preset
    : finite(legacyBlur) && legacyBlur > 0
      ? 'square'
      : 'rounded';
  return {
    preset,
    radius: finite(shape.radius) ? Math.max(0, Math.min(100, shape.radius)) : 35,
    color: typeof shape.color === 'string' ? shape.color : '#000000',
    opacity: finite(shape.opacity) ? Math.max(0, Math.min(100, shape.opacity)) : hasShape ? 50 : 0,
    blur: finite(shape.blur)
      ? Math.max(0, Math.min(48, shape.blur))
      : finite(legacyBlur)
        ? Math.max(0, Math.min(48, legacyBlur))
        : hasShape
          ? 8
          : 0,
    padding: finite(shape.padding) ? Math.max(0, Math.min(100, shape.padding)) : hasShape ? 30 : 0,
  };
};

const normalizeCaptionStyle = (value) => {
  const style = value || {};
  if (
    typeof style.color !== 'string' ||
    !finite(style.fontSize) ||
    typeof style.wrap !== 'boolean' ||
    typeof style.shadowColor !== 'string' ||
    !finite(style.shadowBlur) ||
    typeof style.outlineColor !== 'string' ||
    !finite(style.outlineWidth) ||
    !finite(style.extrusionDepth) ||
    !['top', 'center', 'bottom'].includes(style.placement)
  )
    throw new Error('Style de caption invalide');
  return {
    fontFamily:
      typeof style.fontFamily === 'string' && style.fontFamily.trim() ? style.fontFamily.slice(0, 200) : 'sans-serif',
    ...(typeof style.fontAssetId === 'string' && /^[a-f0-9]{64}$/.test(style.fontAssetId)
      ? { fontAssetId: style.fontAssetId }
      : {}),
    fontWeight: style.fontWeight === 400 ? 400 : 800,
    fontStyle: style.fontStyle === 'italic' ? 'italic' : 'normal',
    textDecoration: style.textDecoration === 'line-through' ? 'line-through' : 'none',
    textAlign: ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'center',
    lineHeight: finite(style.lineHeight) ? Math.max(0.8, Math.min(2, style.lineHeight)) : 1.2,
    letterSpacing: finite(style.letterSpacing) ? Math.max(-5, Math.min(20, style.letterSpacing)) : 0,
    color: style.color,
    fontSize: Math.max(1, Math.min(256, style.fontSize)),
    wrap: style.wrap,
    shadowColor: style.shadowColor,
    shadowBlur: Math.max(0, style.shadowBlur),
    shape: normalizeCaptionShape(style.shape, style.backdropBlur),
    outlineColor: style.outlineColor,
    outlineWidth: Math.max(0, Math.min(30, style.outlineWidth)),
    extrusionDepth: Math.max(0, Math.min(20, style.extrusionDepth)),
    placement: style.placement,
    wordHighlight: normalizeWordHighlight(style.wordHighlight),
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
