const fs = require('fs');
const path = require('path');

const defaultAppearance = () => ({
  theme: 'light',
  primaryColor: '#ff5a1f',
  secondaryColor: '#6366f1',
  radiusPx: 10,
  isPillRadius: false,
  surfaceTone: 'default',
  activePresetId: 'beam-sunset',
  uiScale: {
    global: 100,
    overrides: { topbar: null, sidebar: null, properties: null, canvasControls: null, timeline: null },
  },
});
const surfaceTones = new Set(['default', 'neutral', 'slate', 'deep']);
const uiScaleRegions = ['topbar', 'sidebar', 'properties', 'canvasControls', 'timeline'];
const uiScales = new Set([50, 75, 100, 125]);
const validUiScale = (value) => uiScales.has(value);

const defaults = (platform = process.platform) => ({
  schemaVersion: 3,
  theme: 'light',
  appearance: defaultAppearance(),
  recordingBar: { visibility: platform === 'linux' ? 'hover-only' : 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  spellCheck: { enabled: true },
  onboardingCompleted: false,
  devices: {},
  shortcuts: {
    'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
    'hud.playPause': { keys: 'Alt+Shift+P', scope: 'global', category: 'hud' },
    'hud.toggleMic': { keys: 'Alt+Shift+M', scope: 'global', category: 'hud' },
    'hud.toggleCamera': { keys: 'Alt+Shift+C', scope: 'global', category: 'hud' },
    'hud.toggleSystemAudio': { keys: 'Alt+Shift+A', scope: 'global', category: 'hud' },
    'editor.playPause': { keys: 'Space', scope: 'application', category: 'video-editor' },
    'teleprompter.toggleVisibility': { keys: 'Alt+Shift+T', scope: 'global', category: 'teleprompter' },
    'teleprompter.toggleAutoscroll': { keys: 'Alt+Shift+O', scope: 'global', category: 'teleprompter' },
    'teleprompter.nextLine': { keys: 'Ctrl+Shift+Right', scope: 'global', category: 'teleprompter' },
    'teleprompter.previousLine': { keys: 'Ctrl+Shift+Left', scope: 'global', category: 'teleprompter' },
  },
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
});
const themes = new Set(['light', 'dark', 'system']);
const scopes = new Set(['global', 'application']);
const shortcut = (value) =>
  value &&
  typeof value.keys === 'string' &&
  value.keys.length > 0 &&
  value.keys.length <= 80 &&
  scopes.has(value.scope) &&
  typeof value.category === 'string' &&
  value.category.length > 0;
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const clamp = (value) => Math.max(0, Math.min(1, value));
const gradient = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.stops) || value.stops.length < 2) return null;
  const stops = value.stops.map((stop, index) => {
    if (!stop || typeof stop !== 'object' || !color(stop.color)) return null;
    const position = Number(stop.position);
    const alpha = Number(stop.alpha);
    return {
      id: typeof stop.id === 'string' && stop.id ? stop.id.slice(0, 80) : `stop-${index}`,
      position: clamp(Number.isFinite(position) ? position : index / Math.max(1, value.stops.length - 1)),
      color: stop.color.toLowerCase(),
      alpha: clamp(Number.isFinite(alpha) ? alpha : 1),
    };
  });
  if (stops.some((stop) => stop === null)) return null;
  const angle = Number(value.angle);
  return {
    type: value.type === 'radial' ? 'radial' : 'linear',
    angle: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 135,
    stops: stops.sort((left, right) => left.position - right.position),
  };
};
const presets = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const colors = Array.isArray(raw.colors)
    ? [...new Set(raw.colors.filter(color).map((item) => item.toLowerCase()))]
    : [];
  const gradients = Array.isArray(raw.gradients) ? raw.gradients.map(gradient).filter(Boolean) : [];
  const uniqueGradients = [...new Map(gradients.map((item) => [JSON.stringify(item), item])).values()];
  return { colors, gradients: uniqueGradients };
};
const normalizeAppearance = (value, fallbackTheme = 'light') => {
  const base = defaultAppearance();
  const raw = value && typeof value === 'object' ? value : {};
  const theme = themes.has(raw.theme) ? raw.theme : themes.has(fallbackTheme) ? fallbackTheme : base.theme;
  const primaryColor = color(raw.primaryColor) ? raw.primaryColor.toLowerCase() : base.primaryColor;
  const secondaryColor = color(raw.secondaryColor) ? raw.secondaryColor.toLowerCase() : base.secondaryColor;
  const rawRadius = Number(raw.radiusPx);
  const radiusPx = Number.isFinite(rawRadius) ? Math.max(0, Math.min(64, Math.round(rawRadius))) : base.radiusPx;
  const isPillRadius = typeof raw.isPillRadius === 'boolean' ? raw.isPillRadius : base.isPillRadius;
  const surfaceTone = surfaceTones.has(raw.surfaceTone) ? raw.surfaceTone : base.surfaceTone;
  const activePresetId =
    typeof raw.activePresetId === 'string' && raw.activePresetId.length > 0 ? raw.activePresetId.slice(0, 80) : null;
  const rawUiScale = raw.uiScale && typeof raw.uiScale === 'object' ? raw.uiScale : {};
  const rawOverrides = rawUiScale.overrides && typeof rawUiScale.overrides === 'object' ? rawUiScale.overrides : {};
  const uiScale = {
    global: validUiScale(rawUiScale.global) ? rawUiScale.global : base.uiScale.global,
    overrides: Object.fromEntries(
      uiScaleRegions.map((region) => [region, validUiScale(rawOverrides[region]) ? rawOverrides[region] : null]),
    ),
  };
  return {
    theme,
    primaryColor,
    secondaryColor,
    radiusPx,
    isPillRadius,
    surfaceTone,
    activePresetId,
    uiScale,
  };
};
const normalize = (value, platform = process.platform) => {
  const base = defaults(platform);
  const next = value && typeof value === 'object' ? value : {};
  const providedShortcuts =
    next.shortcuts && typeof next.shortcuts === 'object'
      ? Object.fromEntries(
          Object.entries(next.shortcuts).flatMap(([id, entry]) =>
            typeof id === 'string' && shortcut(entry)
              ? [[id, { keys: entry.keys, scope: entry.scope, category: entry.category }]]
              : [],
          ),
        )
      : {};
  const shortcuts = { ...base.shortcuts, ...providedShortcuts };
  const globalKeys = new Set();
  for (const entry of Object.values(shortcuts)) {
    if (entry.scope === 'global') {
      const key = entry.keys.toLowerCase();
      if (globalKeys.has(key)) throw new Error('Raccourci global dupliqué');
      globalKeys.add(key);
    }
  }
  const resolvedTheme = themes.has(next.theme)
    ? next.theme
    : themes.has(next.appearance?.theme)
      ? next.appearance.theme
      : base.theme;
  const appearanceSettings = normalizeAppearance(next.appearance, resolvedTheme);
  appearanceSettings.theme = resolvedTheme;

  return {
    schemaVersion: 3,
    theme: resolvedTheme,
    appearance: appearanceSettings,
    recordingBar: {
      visibility: ['always', 'auto-fade', 'hover-only'].includes(next.recordingBar?.visibility)
        ? next.recordingBar.visibility
        : base.recordingBar.visibility,
    },
    recordingInteractions: {
      enabled:
        typeof next.recordingInteractions?.enabled === 'boolean'
          ? next.recordingInteractions.enabled
          : base.recordingInteractions.enabled,
      noticeDismissed:
        typeof next.recordingInteractions?.noticeDismissed === 'boolean'
          ? next.recordingInteractions.noticeDismissed
          : base.recordingInteractions.noticeDismissed,
    },
    spellCheck: {
      enabled: typeof next.spellCheck?.enabled === 'boolean' ? next.spellCheck.enabled : base.spellCheck.enabled,
    },
    onboardingCompleted:
      typeof next.onboardingCompleted === 'boolean' ? next.onboardingCompleted : base.onboardingCompleted,
    devices: next.devices && typeof next.devices === 'object' && !Array.isArray(next.devices) ? next.devices : {},
    shortcuts,
    backgroundPresets: presets(next.backgroundPresets),
    extras: next.extras && typeof next.extras === 'object' && !Array.isArray(next.extras) ? next.extras : {},
  };
};
function createPreferencesStore(file, { platform = process.platform } = {}) {
  const targetFile = path.extname(file) ? file : path.join(file, 'preferencesSettings.json');
  const read = () => {
    try {
      return normalize(JSON.parse(fs.readFileSync(targetFile, 'utf8')), platform);
    } catch {
      return defaults(platform);
    }
  };
  const write = (value) => {
    const next = normalize(value, platform);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    const temp = `${targetFile}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(temp, targetFile);
    return next;
  };
  const patch = (value) => {
    const current = read();
    const nextAppearance = value?.appearance ? { ...current.appearance, ...value.appearance } : current.appearance;
    const nextTheme = value?.theme || value?.appearance?.theme || current.theme;
    if (nextAppearance) {
      nextAppearance.theme = nextTheme;
    }
    return write({
      ...current,
      ...(value || {}),
      theme: nextTheme,
      appearance: nextAppearance,
      recordingBar: { ...current.recordingBar, ...(value?.recordingBar || {}) },
      recordingInteractions: {
        ...current.recordingInteractions,
        ...(value?.recordingInteractions || {}),
      },
      spellCheck: { ...current.spellCheck, ...(value?.spellCheck || {}) },
      devices: { ...current.devices, ...(value?.devices || {}) },
      shortcuts: { ...current.shortcuts, ...(value?.shortcuts || {}) },
      backgroundPresets: { ...current.backgroundPresets, ...(value?.backgroundPresets || {}) },
      extras: { ...current.extras, ...(value?.extras || {}) },
    });
  };
  return { read, write, patch, file: targetFile };
}
module.exports = { createPreferencesStore, defaults, normalize };
