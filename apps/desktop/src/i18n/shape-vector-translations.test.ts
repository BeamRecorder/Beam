import { describe, expect, it } from 'vitest';
const messages = import.meta.glob('./*/core.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, Record<string, string>>
>;
const editorMessages = import.meta.glob('./*/editor.json', { eager: true, import: 'default' }) as typeof messages;
const keys = [
  'arrowLibrary',
  'arrowPreset_solid',
  'arrowPreset_line',
  'arrowPreset_double',
  'arrowPreset_curved',
  'arrowPreset_elbow',
  'drawArrow',
  'drawArrowHint',
  'editNodes',
  'finishNodes',
  'nodeHint',
  'cornerNode',
  'smoothNode',
  'insertNode',
  'removeNode',
  'closedPath',
  'startMarker',
  'endMarker',
  'markerSize',
  'marker_none',
  'marker_triangle',
  'marker_open',
  'marker_circle',
  'anchorPoint',
  'curveHandle',
  'path',
  'anchorToolbarHint',
  'freehandToolbarHint',
  'applyDrawing',
  'cancelDrawing',
  'searchArrows',
  'noArrowResults',
  'arrowCount',
  ...[
    'open',
    'round-start',
    'round-head',
    'open-double',
    'filled-left',
    'filled-up',
    'filled-down',
    'filled-double',
    'chevron',
    'notched',
    'wide',
    'slender',
    'bent-filled',
    'arc',
    'reverse-curve',
    's-curve',
    'wave',
    'hook',
    'u-turn',
    'zigzag',
    'loop',
    'elbow-double',
    'arc-double',
    'filled-curved',
    'swoosh',
  ].map((id) => `arrowPreset_${id}`),
];
describe('shared arrow and vector controls translations', () => {
  it('covers all fifteen supported languages', () => expect(Object.keys(messages)).toHaveLength(15));
  it.each(Object.entries(messages))('provides translated labels, hints and anchor numbering in %s', (file, value) => {
    for (const key of keys) expect(value.Elements![key], `${file}: ${key}`).toBeTruthy();
    expect(value.Elements!.anchorPoint).toContain('{index}');
    if (file !== './en/core.json')
      for (const key of ['drawHint', 'drawArrowHint', 'nodeHint', 'anchorToolbarHint', 'freehandToolbarHint'])
        expect(value.Elements![key], `${file}: ${key}`).not.toBe(messages['./en/core.json']!.Elements![key]);
  });
});

for (const bundle of [
  {
    messages,
    source: './en/core.json',
    sections: [
      'Elements',
      'CanvasPanel',
      'BorderAndFrameControls',
      'ProjectPicker',
      'TransformControls',
      'ClipPropertiesPanel',
      'ColorPicker',
      'CaptionClipPanel',
    ],
  },
  { messages: editorMessages, source: './en/editor.json', sections: ['ShadowDirectionGroup'] },
]) {
  describe(`complete inspector labels and tooltips in ${bundle.source}`, () => {
    it('has all fifteen language bundles', () => expect(Object.keys(bundle.messages)).toHaveLength(15));
    it.each(Object.entries(bundle.messages))(
      'provides every label and preserves interpolation parameters in %s',
      (file, locale) => {
        for (const section of bundle.sections) {
          for (const [key, source] of Object.entries(bundle.messages[bundle.source]![section]!)) {
            const translation = locale[section]?.[key];
            expect(translation, `${file}: ${section}.${key}`).toBeTypeOf('string');
            expect(translation?.trim(), `${file}: ${section}.${key}`).toBeTruthy();
            const parameters = (value: string) => Array.from(value.matchAll(/\{(\w+)\}/g), (match) => match[1]).sort();
            expect(parameters(translation!)).toEqual(parameters(source));
          }
        }
      },
    );
  });
}
