const CURSOR_TYPES = new Set([
  'automatic',
  'default',
  'beachball',
  'busy',
  'cell',
  'contextualmenu',
  'copy',
  'cross',
  'handgrabbing',
  'handopen',
  'handpointing',
  'help',
  'makealias',
  'move',
  'notallowed',
  'poof',
  'resizenorth',
  'resizenortheast',
  'resizenortheastsouthwest',
  'resizenorthsouth',
  'resizenorthwest',
  'resizenorthwestsoutheast',
  'resizeright',
  'resizesouth',
  'resizesoutheast',
  'resizesouthwest',
  'resizeup',
  'resizeupdown',
  'resizewest',
  'resizewesteast',
  'screenshotselection',
  'screenshotwindow',
  'textcursor',
  'textcursorvertical',
  'zoomin',
  'zoomout',
]);
const PRESETS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '3:4': [1080, 1440],
  '4:3': [1440, 1080],
  '21:9': [2520, 1080],
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const defaultCursor = () => ({
  selectedCursor: 'automatic',
  size: 45,
  color: '#000000',
  shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
  clickEffects: {
    left: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#ff5a1f' },
    right: { springEnabled: true, springIntensity: 50, rippleEnabled: true, rippleSize: 30, rippleColor: '#6366f1' },
  },
  motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
});

const zoomState = (value) => {
  if (!value || !Array.isArray(value.elements) || !Array.isArray(value.generatedSessions))
    throw new Error('État de zoom invalide');
  const ids = new Set();
  const elements = value.elements.map((element) => {
    if (
      !element ||
      typeof element.id !== 'string' ||
      !element.id ||
      ids.has(element.id) ||
      typeof element.sessionId !== 'string' ||
      !finite(element.startMs) ||
      !finite(element.endMs) ||
      element.endMs <= element.startMs ||
      !element.focus ||
      !finite(element.focus.cx) ||
      !finite(element.focus.cy) ||
      element.focus.cx < 0 ||
      element.focus.cx > 1 ||
      element.focus.cy < 0 ||
      element.focus.cy > 1 ||
      ![1, 2, 3, 4, 5, 6].includes(element.depth) ||
      !['auto', 'manual'].includes(element.mode)
    )
      throw new Error('Propriétés de zoom invalides');
    ids.add(element.id);
    return {
      id: element.id,
      sessionId: element.sessionId,
      startMs: Math.round(element.startMs),
      endMs: Math.round(element.endMs),
      focus: { cx: element.focus.cx, cy: element.focus.cy },
      depth: element.depth,
      mode: element.mode,
    };
  });
  const generatedSessions = value.generatedSessions.map((record) => {
    if (
      !record ||
      typeof record.sessionId !== 'string' ||
      !record.sessionId ||
      !Number.isInteger(record.algorithmVersion) ||
      typeof record.generatedAt !== 'string'
    )
      throw new Error('Métadonnées de génération invalides');
    return { sessionId: record.sessionId, algorithmVersion: record.algorithmVersion, generatedAt: record.generatedAt };
  });
  return { elements, generatedSessions };
};

const clickEffect = (value) => {
  if (
    !value ||
    typeof value.springEnabled !== 'boolean' ||
    !finite(value.springIntensity) ||
    typeof value.rippleEnabled !== 'boolean' ||
    !finite(value.rippleSize) ||
    typeof value.rippleColor !== 'string' ||
    !value.rippleColor
  )
    throw new Error('Effet de clic curseur invalide');
  return {
    springEnabled: value.springEnabled,
    springIntensity: clamp(value.springIntensity, 0, 100),
    rippleEnabled: value.rippleEnabled,
    rippleSize: clamp(value.rippleSize, 10, 80),
    rippleColor: value.rippleColor,
  };
};

const cursorState = (value) => {
  if (
    !value ||
    !CURSOR_TYPES.has(value.selectedCursor) ||
    !finite(value.size) ||
    typeof value.color !== 'string' ||
    !value.color ||
    !value.shadow ||
    typeof value.shadow.enabled !== 'boolean' ||
    !finite(value.shadow.blur) ||
    typeof value.shadow.color !== 'string' ||
    !value.shadow.color ||
    !['all', 'bottom', 'bottom-right', 'top-left'].includes(value.shadow.direction) ||
    !value.clickEffects ||
    !value.motion ||
    !['focused', 'smooth', 'custom'].includes(value.motion.preset) ||
    !finite(value.motion.smoothing) ||
    !finite(value.motion.springMassMultiplier) ||
    !finite(value.motion.motionBlur)
  )
    throw new Error('Présentation du curseur invalide');
  return {
    selectedCursor: value.selectedCursor,
    size: clamp(value.size, 1, 256),
    color: value.color,
    shadow: {
      enabled: value.shadow.enabled,
      blur: clamp(value.shadow.blur, 0, 96),
      color: value.shadow.color,
      direction: value.shadow.direction,
    },
    clickEffects: { left: clickEffect(value.clickEffects.left), right: clickEffect(value.clickEffects.right) },
    motion: {
      preset: value.motion.preset,
      smoothing: clamp(value.motion.smoothing, 0, 1),
      springMassMultiplier: clamp(value.motion.springMassMultiplier, 0.5, 2),
      motionBlur: clamp(value.motion.motionBlur, 0, 1),
    },
  };
};

const canvasState = (value) => {
  if (
    !value ||
    typeof value.showBackground !== 'boolean' ||
    (!Object.hasOwn(PRESETS, value.preset) && value.preset !== 'custom')
  )
    throw new Error('Canvas invalide');
  const dimensions = value.preset === 'custom' ? [value.width, value.height] : PRESETS[value.preset];
  if (!dimensions.every(finite) || dimensions.some((dimension) => dimension <= 0))
    throw new Error('Dimensions du canvas invalides');
  return {
    preset: value.preset,
    width: Math.round(dimensions[0]),
    height: Math.round(dimensions[1]),
    showBackground: value.showBackground,
  };
};

const presentationState = (value) => {
  if (!value || !Array.isArray(value.importedBackgrounds) || !finite(value.blurPercent))
    throw new Error('Présentation éditeur invalide');
  if (value.selectedBackgroundId !== null && typeof value.selectedBackgroundId !== 'string')
    throw new Error('Fond sélectionné invalide');
  const importedBackgrounds = value.importedBackgrounds.map((item) => {
    if (!item || typeof item.id !== 'string' || typeof item.path !== 'string') throw new Error('Fond importé invalide');
    return item;
  });
  return {
    canvas: canvasState(value.canvas),
    selectedBackgroundId: value.selectedBackgroundId,
    background: value.background && typeof value.background === 'object' ? value.background : null,
    blurPercent: clamp(Math.round(value.blurPercent), 0, 100),
    importedBackgrounds,
    cursor: cursorState(value.cursor),
  };
};

const migratePresentation = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  const canvasInput = input.canvas && typeof input.canvas === 'object' ? input.canvas : {};
  const preset =
    Object.hasOwn(PRESETS, canvasInput.preset) || canvasInput.preset === 'custom' ? canvasInput.preset : '16:9';
  const [width, height] =
    preset === 'custom'
      ? [finite(canvasInput.width) ? canvasInput.width : 1920, finite(canvasInput.height) ? canvasInput.height : 1080]
      : PRESETS[preset];
  const cursor = defaultCursor();
  if (input.cursorEffects && typeof input.cursorEffects === 'object') {
    for (const button of ['left', 'right'])
      cursor.clickEffects[button] = { ...cursor.clickEffects[button], ...(input.cursorEffects[button] || {}) };
  }
  if (input.cursorMotion && typeof input.cursorMotion === 'object')
    cursor.motion = { ...cursor.motion, ...input.cursorMotion };
  return presentationState({
    canvas: {
      preset,
      width,
      height,
      showBackground: typeof canvasInput.showBackground === 'boolean' ? canvasInput.showBackground : true,
    },
    selectedBackgroundId: typeof input.selectedBackgroundId === 'string' ? input.selectedBackgroundId : null,
    background: input.background && typeof input.background === 'object' ? input.background : null,
    blurPercent: finite(input.blurPercent) ? input.blurPercent : 0,
    importedBackgrounds: Array.isArray(input.importedBackgrounds) ? input.importedBackgrounds : [],
    cursor,
  });
};

const createDefaultPresentation = () => migratePresentation(null);

module.exports = { createDefaultPresentation, migratePresentation, presentationState, zoomState };
