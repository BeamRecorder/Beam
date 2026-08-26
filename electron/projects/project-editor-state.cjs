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
const defaultZoomMotionBlur = () => ({ enabled: true, intensity: 0.55 });
const canvasTransitionKinds = new Set(['fade', 'slide', 'zoom', 'blur']);
const canvasTransitionEasingPower = (value) =>
  value === undefined || !finite(value) ? undefined : clamp(Math.round(value), 1, 5);

const canvasTransition = (value) => {
  if (!value || typeof value !== 'object' || !value.preset || !canvasTransitionKinds.has(value.preset.kind))
    return null;
  const preset = value.preset;
  if (preset.kind === 'slide' && !['left', 'right', 'up', 'down'].includes(preset.direction)) return null;
  if (preset.kind === 'zoom' && !['in', 'out'].includes(preset.direction)) return null;
  if ((preset.kind === 'fade' || preset.kind === 'blur') && Object.keys(preset).some((key) => key !== 'kind'))
    return null;
  if (!finite(value.durationMs)) return null;
  const durationMs = clamp(Math.round(value.durationMs), 1, 5000);
  const easingPower = canvasTransitionEasingPower(value.easingPower);
  return {
    preset: { ...preset },
    durationMs,
    ...(easingPower === undefined ? {} : { easingPower }),
  };
};

const canvasTransitions = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  return { entry: canvasTransition(input.entry), exit: canvasTransition(input.exit) };
};

const defaultCursor = () => ({
  selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
  size: 45,
  color: '#000000',
  shadow: { enabled: true, blur: 6, color: '#000000', direction: 'bottom' },
  clickEffects: {
    left: {
      springEnabled: true,
      springIntensity: 50,
      rippleEnabled: false,
      rippleStyle: 'single',
      rippleSize: 30,
      rippleColor: '#ff5a1f',
    },
    right: {
      springEnabled: true,
      springIntensity: 50,
      rippleEnabled: false,
      rippleStyle: 'single',
      rippleSize: 30,
      rippleColor: '#6366f1',
    },
  },
  motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
  autoHide: { enabled: false, delaySeconds: 2, fadeDurationMs: 250 },
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
      !['auto', 'manual'].includes(element.mode) ||
      (element.enabled !== undefined && typeof element.enabled !== 'boolean') ||
      (element.projection !== undefined && !['2d', '3d'].includes(element.projection)) ||
      (element.tiltIntensity !== undefined && !finite(element.tiltIntensity)) ||
      (element.tiltHorizontal !== undefined && !finite(element.tiltHorizontal)) ||
      (element.tiltVertical !== undefined && !finite(element.tiltVertical)) ||
      (element.tiltPreset !== undefined && !['small', 'medium', 'large', 'custom'].includes(element.tiltPreset))
    )
      throw new Error('Propriétés de zoom invalides');
    ids.add(element.id);
    const tiltIntensity = clamp(element.tiltIntensity === undefined ? 0.6 : element.tiltIntensity, 0, 1);
    const inferredTiltPreset =
      Math.abs(tiltIntensity - 0.3) < 1e-6
        ? 'small'
        : Math.abs(tiltIntensity - 0.6) < 1e-6
          ? 'medium'
          : Math.abs(tiltIntensity - 1) < 1e-6
            ? 'large'
            : 'custom';
    return {
      id: element.id,
      sessionId: element.sessionId,
      startMs: Math.round(element.startMs),
      endMs: Math.round(element.endMs),
      focus: { cx: element.focus.cx, cy: element.focus.cy },
      depth: element.depth,
      mode: element.mode,
      enabled: element.enabled !== false,
      projection: element.projection === '3d' ? '3d' : '2d',
      tiltIntensity,
      tiltHorizontal: clamp(element.tiltHorizontal === undefined ? 0.65 : element.tiltHorizontal, -1, 1),
      tiltVertical: clamp(element.tiltVertical === undefined ? -0.35 : element.tiltVertical, -1, 1),
      tiltPreset: element.tiltPreset ?? inferredTiltPreset,
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
  const motionBlurInput = value.motionBlur;
  if (
    motionBlurInput !== undefined &&
    (!motionBlurInput || typeof motionBlurInput.enabled !== 'boolean' || !finite(motionBlurInput.intensity))
  )
    throw new Error('Flou de mouvement du zoom invalide');
  const motionBlur = motionBlurInput
    ? { enabled: motionBlurInput.enabled, intensity: clamp(motionBlurInput.intensity, 0, 1) }
    : defaultZoomMotionBlur();
  return { elements, generatedSessions, motionBlur };
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
  const rippleStyle = ['none', 'single', 'double', 'solid'].includes(value.rippleStyle) ? value.rippleStyle : 'single';
  return {
    springEnabled: value.springEnabled,
    springIntensity: clamp(value.springIntensity, 0, 100),
    rippleEnabled: value.rippleEnabled,
    rippleStyle,
    rippleSize: clamp(value.rippleSize, 10, 80),
    rippleColor: value.rippleColor,
  };
};

const cursorState = (value) => {
  const legacyCursor = value?.selectedCursor;
  const selection =
    value?.selection && typeof value.selection === 'object'
      ? value.selection
      : CURSOR_TYPES.has(legacyCursor)
        ? {
            packId: 'builtin:macos',
            mode: legacyCursor === 'automatic' ? 'automatic' : 'fixed',
            cursorId: legacyCursor === 'automatic' ? null : legacyCursor,
          }
        : null;
  if (
    !value ||
    !selection ||
    typeof selection.packId !== 'string' ||
    !selection.packId ||
    !['automatic', 'fixed'].includes(selection.mode) ||
    (selection.mode === 'fixed' && (typeof selection.cursorId !== 'string' || !selection.cursorId)) ||
    (selection.mode === 'automatic' && selection.cursorId !== null && selection.cursorId !== undefined) ||
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
  const leftClickEffect = clickEffect(value.clickEffects.left);
  const rightClickEffect = clickEffect(value.clickEffects.right);
  const sharedRippleStyle =
    [leftClickEffect.rippleStyle, rightClickEffect.rippleStyle].find(
      (style) => style === 'single' || style === 'double' || style === 'solid',
    ) || 'single';
  return {
    selection: {
      packId: selection.packId,
      mode: selection.mode,
      cursorId: selection.mode === 'fixed' ? selection.cursorId : null,
    },
    size: clamp(value.size, 1, 256),
    color: value.color,
    shadow: {
      enabled: value.shadow.enabled,
      blur: clamp(value.shadow.blur, 0, 96),
      color: value.shadow.color,
      direction: value.shadow.direction,
    },
    clickEffects: {
      left: { ...leftClickEffect, rippleStyle: sharedRippleStyle },
      right: { ...rightClickEffect, rippleStyle: sharedRippleStyle },
    },
    motion: {
      preset: value.motion.preset,
      smoothing: clamp(value.motion.smoothing, 0, 1),
      springMassMultiplier: clamp(value.motion.springMassMultiplier, 0.5, 2),
      motionBlur: clamp(value.motion.motionBlur, 0, 1),
    },
    autoHide: {
      enabled: value.autoHide?.enabled === true,
      delaySeconds: finite(value.autoHide?.delaySeconds) ? clamp(value.autoHide.delaySeconds, 0.5, 10) : 2,
      fadeDurationMs: finite(value.autoHide?.fadeDurationMs) ? clamp(value.autoHide.fadeDurationMs, 0, 1000) : 250,
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
  const watermarkInput = value.watermark && typeof value.watermark === 'object' ? value.watermark : {};
  const watermarkPositions = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  const watermark = {
    enabled: watermarkInput.enabled === true,
    text: watermarkInput.text === 'none' || watermarkInput.text === 'beam' ? watermarkInput.text : 'made-with-beam',
    showLogo: watermarkInput.showLogo !== false,
    localized: watermarkInput.localized === true,
    renderedText:
      typeof watermarkInput.renderedText === 'string' ? watermarkInput.renderedText.slice(0, 80) : undefined,
    position: watermarkPositions.has(watermarkInput.position) ? watermarkInput.position : 'bottom-right',
    size: finite(watermarkInput.size) ? clamp(Math.round(watermarkInput.size), 50, 200) : 100,
    shadow: finite(watermarkInput.shadow) ? clamp(Math.round(watermarkInput.shadow), 0, 100) : 20,
    backgroundColor:
      typeof watermarkInput.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(watermarkInput.backgroundColor)
        ? watermarkInput.backgroundColor
        : '#111114',
    backgroundOpacity: finite(watermarkInput.backgroundOpacity)
      ? clamp(Math.round(watermarkInput.backgroundOpacity), 0, 100)
      : 78,
    backgroundRadius: finite(watermarkInput.backgroundRadius)
      ? clamp(Math.round(watermarkInput.backgroundRadius), 0, 100)
      : 100,
    backgroundPadding: finite(watermarkInput.backgroundPadding)
      ? clamp(Math.round(watermarkInput.backgroundPadding), 50, 150)
      : 100,
  };
  return {
    preset: value.preset,
    width: Math.round(dimensions[0]),
    height: Math.round(dimensions[1]),
    showBackground: value.showBackground,
    transitions: canvasTransitions(value.transitions),
    ...(value.watermark && typeof value.watermark === 'object' ? { watermark } : {}),
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
  if (input.cursor && typeof input.cursor === 'object') {
    Object.assign(cursor, input.cursor);
    if (!input.cursor.selection && CURSOR_TYPES.has(input.cursor.selectedCursor)) {
      cursor.selection = {
        packId: 'builtin:macos',
        mode: input.cursor.selectedCursor === 'automatic' ? 'automatic' : 'fixed',
        cursorId: input.cursor.selectedCursor === 'automatic' ? null : input.cursor.selectedCursor,
      };
    }
  }
  return presentationState({
    canvas: {
      preset,
      width,
      height,
      showBackground: typeof canvasInput.showBackground === 'boolean' ? canvasInput.showBackground : true,
      transitions: canvasInput.transitions,
      watermark: canvasInput.watermark,
    },
    selectedBackgroundId: typeof input.selectedBackgroundId === 'string' ? input.selectedBackgroundId : null,
    background: input.background && typeof input.background === 'object' ? input.background : null,
    blurPercent: finite(input.blurPercent) ? input.blurPercent : 0,
    importedBackgrounds: Array.isArray(input.importedBackgrounds) ? input.importedBackgrounds : [],
    cursor,
  });
};

const createDefaultPresentation = () => migratePresentation(null);

module.exports = {
  createDefaultPresentation,
  defaultZoomMotionBlur,
  migratePresentation,
  presentationState,
  zoomState,
};
