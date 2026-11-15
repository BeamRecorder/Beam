import { describe, expect, it } from 'vitest';

const locales = import.meta.glob('./*/editor.json', { eager: true, import: 'default' }) as Record<
  string,
  { ZoomPanel: Record<string, string> }
>;

describe('progressive camera follow translations', () => {
  it.each(['cameraFollowDesc', 'straightPaths', 'straightPathsDesc'])(
    'describes %s in all fifteen languages',
    (key) => {
      expect(Object.keys(locales)).toHaveLength(15);
      const translations = Object.values(locales).map((locale) => locale.ZoomPanel[key]!);
      expect(translations.every((value) => value.trim().length > 0)).toBe(true);
      expect(new Set(translations).size).toBe(15);
    },
  );
});

it('translates the experimental mode and its explanation in all fifteen languages', () => {
  const values = Object.values(locales).map((locale) => [
    locale.ZoomPanel.experimentalZoom!,
    locale.ZoomPanel.experimentalZoomDesc!,
  ]);
  expect(values).toHaveLength(15);
  expect(values.every((pair) => pair.every((value) => value.trim().length > 0))).toBe(true);
  expect(new Set(values.map((pair) => pair.join(' '))).size).toBe(15);
});

it('translates every experimental camera and independent background control', () => {
  const keys = [
    'zoomBackground',
    'zoomBackgroundDesc',
    'recordlyFocused',
    'recordlyCinematic',
    'recordlyClassic',
    'recordlyConnect',
    'recordlyGap',
    'recordlyPan',
    'recordlyEntry',
    'recordlyExit',
    'recordlyDuration',
    'recordlySmoothness',
    'recordlyStiffness',
    'recordlyDamping',
    'recordlyMass',
    'recordlyNoSlots',
    'recordlyNoTelemetry',
    'recordlyPanThreshold',
    'recordlyZoomThreshold',
    'recordlyDirectionalMax',
    'recordlyRadialMax',
  ];
  for (const [path, locale] of Object.entries(locales))
    for (const key of keys) expect(locale.ZoomPanel[key]?.trim(), `${path}:${key}`).toBeTruthy();
});
