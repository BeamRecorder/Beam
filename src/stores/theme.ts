import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { capture } from '../api/capture';
import {
  adjustHexBrightness,
  DEFAULT_APPEARANCE,
  hexToRgba,
  SURFACE_TONES,
  type AppearanceSettings,
  type SurfaceTone,
  type ThemeMode,
  type ThemePreset,
  type UiScalePercent,
  type UiScaleRegion,
} from '../types/appearance';

export const useThemeStore = defineStore('theme', () => {
  const logTheme = (message: string, details?: unknown) => {
    if (details === undefined) console.info(`[Beam appearance] ${message}`);
    else console.info(`[Beam appearance] ${message}`, details);
  };

  const theme = ref<ThemeMode>(DEFAULT_APPEARANCE.theme);
  const primaryColor = ref<string>(DEFAULT_APPEARANCE.primaryColor);
  const secondaryColor = ref<string>(DEFAULT_APPEARANCE.secondaryColor);
  const radiusPx = ref<number>(DEFAULT_APPEARANCE.radiusPx);
  const isPillRadius = ref<boolean>(DEFAULT_APPEARANCE.isPillRadius);
  const surfaceTone = ref<SurfaceTone>(DEFAULT_APPEARANCE.surfaceTone);
  const activePresetId = ref<string | null>(DEFAULT_APPEARANCE.activePresetId ?? null);
  const uiScaleGlobal = ref<UiScalePercent>(DEFAULT_APPEARANCE.uiScale!.global);
  const uiScaleOverrides = ref({ ...DEFAULT_APPEARANCE.uiScale!.overrides });

  const hydrated = ref(false);
  let synchronizingPreference = false;
  let synchronizedAppearance: string | null = null;
  let radiusPersistenceTimer: ReturnType<typeof setTimeout> | null = null;
  let uiScalePersistenceTimer: ReturnType<typeof setTimeout> | null = null;

  const mediaQuery =
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const systemDark = ref(Boolean(mediaQuery?.matches));

  const appearance = computed<AppearanceSettings>(() => ({
    theme: theme.value,
    primaryColor: primaryColor.value,
    secondaryColor: secondaryColor.value,
    radiusPx: radiusPx.value,
    isPillRadius: isPillRadius.value,
    surfaceTone: surfaceTone.value,
    activePresetId: activePresetId.value,
    uiScale: {
      global: uiScaleGlobal.value,
      overrides: { ...uiScaleOverrides.value },
    },
  }));
  const appearanceSignature = () => JSON.stringify(appearance.value);

  const isDarkMode = computed(() => {
    return theme.value === 'dark' || (theme.value === 'system' && systemDark.value);
  });

  const applyAppearanceTokens = () => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const isDark = isDarkMode.value;

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const style = root.style;
    const primary = primaryColor.value;
    const secondary = secondaryColor.value;
    const radius = radiusPx.value;
    const isPill = isPillRadius.value;

    // Primary color tokens
    style.setProperty('--color-primary', primary);
    style.setProperty('--color-primary-hover', adjustHexBrightness(primary, isDark ? 12 : -10));
    style.setProperty('--color-primary-light', hexToRgba(primary, isDark ? 0.18 : 0.1));
    style.setProperty('--color-primary-border', hexToRgba(primary, 0.35));

    // Secondary color tokens
    style.setProperty('--color-secondary', secondary);

    // Radius tokens
    if (isPill) {
      style.setProperty('--radius-sm', '9999px');
      style.setProperty('--radius-md', '9999px');
      style.setProperty('--radius-lg', '9999px');
    } else {
      const sm = Math.max(2, Math.round(radius * 0.6));
      const md = radius;
      const lg = Math.round(radius * 1.5);
      style.setProperty('--radius-sm', `${sm}px`);
      style.setProperty('--radius-md', `${md}px`);
      style.setProperty('--radius-lg', `${lg}px`);
    }

    // Surface tone tokens
    const toneConfig = SURFACE_TONES[surfaceTone.value] ?? SURFACE_TONES.default;
    const toneStyles = isDark ? toneConfig.dark : toneConfig.light;
    style.setProperty('--color-bg-app', toneStyles.bgApp);
    style.setProperty('--color-bg-surface', toneStyles.bgSurface);
    style.setProperty('--color-bg-surface-hover', toneStyles.bgSurfaceHover);
    style.setProperty('--color-bg-element', toneStyles.bgElement);
    style.setProperty('--color-border', toneStyles.border);
    style.setProperty('--color-border-strong', toneStyles.borderStrong);

    const resolvedScale = (region: UiScaleRegion) => (uiScaleOverrides.value[region] ?? uiScaleGlobal.value) / 100;
    style.setProperty('--ui-scale-topbar', String(resolvedScale('topbar')));
    style.setProperty('--ui-scale-sidebar', String(resolvedScale('sidebar')));
    style.setProperty('--ui-scale-properties', String(resolvedScale('properties')));
    style.setProperty('--ui-scale-canvas-controls', String(resolvedScale('canvasControls')));
    style.setProperty('--ui-scale-timeline', String(resolvedScale('timeline')));
  };

  const applyTheme = () => {
    applyAppearanceTokens();
  };

  const hydrateFromSettings = (appSettings?: Partial<AppearanceSettings>, rootTheme?: ThemeMode) => {
    synchronizingPreference = true;
    if (rootTheme) theme.value = rootTheme;
    if (appSettings?.theme) theme.value = appSettings.theme;
    if (appSettings?.primaryColor) primaryColor.value = appSettings.primaryColor;
    if (appSettings?.secondaryColor) secondaryColor.value = appSettings.secondaryColor;
    if (typeof appSettings?.radiusPx === 'number') radiusPx.value = appSettings.radiusPx;
    if (typeof appSettings?.isPillRadius === 'boolean') isPillRadius.value = appSettings.isPillRadius;
    if (appSettings?.surfaceTone) surfaceTone.value = appSettings.surfaceTone;
    if (appSettings?.activePresetId !== undefined) activePresetId.value = appSettings.activePresetId;
    if (appSettings?.uiScale) {
      uiScaleGlobal.value = appSettings.uiScale.global;
      uiScaleOverrides.value = {
        ...DEFAULT_APPEARANCE.uiScale!.overrides,
        ...appSettings.uiScale.overrides,
      };
    }
    synchronizedAppearance = appearanceSignature();
    synchronizingPreference = false;
    applyAppearanceTokens();
  };

  void capture
    .getPreferences()
    .then((preferences) => {
      hydrateFromSettings(preferences.appearance, preferences.theme);
      hydrated.value = true;
      logTheme('appearance hydrated', { appearance: preferences.appearance });
    })
    .catch(() => {
      hydrated.value = true;
      applyAppearanceTokens();
      logTheme('preferences hydration failed; using default appearance');
    });

  const persistAppearance = () => {
    if (!hydrated.value || synchronizingPreference) return;
    void capture
      .updatePreferences({
        theme: theme.value,
        appearance: {
          theme: theme.value,
          primaryColor: primaryColor.value,
          secondaryColor: secondaryColor.value,
          radiusPx: radiusPx.value,
          isPillRadius: isPillRadius.value,
          surfaceTone: surfaceTone.value,
          activePresetId: activePresetId.value,
          uiScale: {
            global: uiScaleGlobal.value,
            overrides: { ...uiScaleOverrides.value },
          },
        },
      })
      .catch(() => undefined);
  };

  const scheduleRadiusPersistence = () => {
    if (radiusPersistenceTimer) clearTimeout(radiusPersistenceTimer);
    radiusPersistenceTimer = setTimeout(() => {
      radiusPersistenceTimer = null;
      persistAppearance();
    }, 120);
  };

  const scheduleUiScalePersistence = () => {
    if (uiScalePersistenceTimer) clearTimeout(uiScalePersistenceTimer);
    uiScalePersistenceTimer = setTimeout(() => {
      uiScalePersistenceTimer = null;
      persistAppearance();
    }, 120);
  };

  watch(
    [
      theme,
      primaryColor,
      secondaryColor,
      radiusPx,
      isPillRadius,
      surfaceTone,
      activePresetId,
      uiScaleGlobal,
      uiScaleOverrides,
    ],
    (_values, oldValues) => {
      applyAppearanceTokens();
      if (appearanceSignature() === synchronizedAppearance) {
        synchronizedAppearance = null;
        return;
      }
      synchronizedAppearance = null;
      const radiusChanged = oldValues && (radiusPx.value !== oldValues[3] || isPillRadius.value !== oldValues[4]);
      const uiScaleChanged =
        oldValues && (uiScaleGlobal.value !== oldValues[7] || uiScaleOverrides.value !== oldValues[8]);
      if (uiScaleChanged) scheduleUiScalePersistence();
      else if (radiusChanged) scheduleRadiusPersistence();
      else persistAppearance();
    },
    { flush: 'pre' },
  );

  mediaQuery?.addEventListener('change', (event) => {
    systemDark.value = event.matches;
    if (theme.value === 'system') {
      applyAppearanceTokens();
    }
  });

  capture.onPreferencesChanged((preferences) => {
    const next = preferences.appearance;
    if (
      preferences.theme === theme.value &&
      (!next ||
        (next.theme === theme.value &&
          next.primaryColor === primaryColor.value &&
          next.secondaryColor === secondaryColor.value &&
          next.radiusPx === radiusPx.value &&
          next.isPillRadius === isPillRadius.value &&
          next.surfaceTone === surfaceTone.value &&
          next.activePresetId === activePresetId.value &&
          JSON.stringify(next.uiScale ?? DEFAULT_APPEARANCE.uiScale) ===
            JSON.stringify({
              global: uiScaleGlobal.value,
              overrides: uiScaleOverrides.value,
            })))
    )
      return;
    hydrateFromSettings(preferences.appearance, preferences.theme);
  });

  const applyPreset = (preset: ThemePreset) => {
    activePresetId.value = preset.id;
    primaryColor.value = preset.primaryColor;
    secondaryColor.value = preset.secondaryColor;
    radiusPx.value = preset.radiusPx;
    isPillRadius.value = Boolean(preset.isPillRadius);
    surfaceTone.value = preset.surfaceTone;
  };

  const setPrimaryColor = (color: string) => {
    activePresetId.value = null;
    primaryColor.value = color;
  };

  const setSecondaryColor = (color: string) => {
    activePresetId.value = null;
    secondaryColor.value = color;
  };

  const setRadius = (px: number, isPill = false) => {
    activePresetId.value = null;
    radiusPx.value = px;
    isPillRadius.value = isPill;
  };

  const setSurfaceTone = (tone: SurfaceTone) => {
    activePresetId.value = null;
    surfaceTone.value = tone;
  };

  const setUiScale = (value: UiScalePercent) => {
    uiScaleGlobal.value = value;
  };

  const setUiScaleOverride = (region: UiScaleRegion, value: UiScalePercent | null) => {
    uiScaleOverrides.value = { ...uiScaleOverrides.value, [region]: value };
  };

  const resolvedUiScale = (region: UiScaleRegion) => uiScaleOverrides.value[region] ?? uiScaleGlobal.value;

  const resetToDefault = () => {
    applyPreset({
      id: 'beam-sunset',
      name: 'Beam Sunset',
      nameFr: 'Coucher de soleil Beam',
      primaryColor: DEFAULT_APPEARANCE.primaryColor,
      secondaryColor: DEFAULT_APPEARANCE.secondaryColor,
      radiusPx: DEFAULT_APPEARANCE.radiusPx,
      isPillRadius: DEFAULT_APPEARANCE.isPillRadius,
      surfaceTone: DEFAULT_APPEARANCE.surfaceTone,
    });
    theme.value = 'light';
    uiScaleGlobal.value = DEFAULT_APPEARANCE.uiScale!.global;
    uiScaleOverrides.value = { ...DEFAULT_APPEARANCE.uiScale!.overrides };
  };

  return {
    theme,
    primaryColor,
    secondaryColor,
    radiusPx,
    isPillRadius,
    surfaceTone,
    activePresetId,
    uiScaleGlobal,
    uiScaleOverrides,
    appearance,
    isDarkMode,
    applyTheme,
    applyAppearanceTokens,
    applyPreset,
    setPrimaryColor,
    setSecondaryColor,
    setRadius,
    setSurfaceTone,
    setUiScale,
    setUiScaleOverride,
    resolvedUiScale,
    resetToDefault,
  };
});
