import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const timelineRoot = resolve(process.cwd(), 'apps/desktop/src/components/editor/timeline');
const timelineTheme = readFileSync(resolve(process.cwd(), 'apps/desktop/src/theme/timeline.css'), 'utf8');
const itemStates = readFileSync(resolve(timelineRoot, 'timeline-item-states.css'), 'utf8');

const items = ['timeline-clip', 'cursor-zoom-indicator', 'annotation-indicator', 'canvas-transition-zone'];
const renderers = [
  'TimelineTracks.vue',
  'TimelineAudioTracks.vue',
  'TimelineCaptionTracks.vue',
  'TimelineCanvasTransitionTrack.vue',
  'TimelineTrackHeaders.vue',
];
const compiled = compileStyle({
  source: itemStates,
  filename: resolve(timelineRoot, 'timeline-item-states.css'),
  id: 'data-v-timeline-test',
  scoped: true,
});

const declarationsFor = (classes: string) => {
  const element = document.createElement('button');
  element.className = classes;
  element.setAttribute('data-v-timeline-test', '');
  const declarations = new Map<string, string>();
  compiled.rawResult!.root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' || !element.matches(rule.selector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });
  return declarations;
};

describe('shared timeline appearance', () => {
  it('compiles with component scoping and without deep selectors', () => {
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('[data-v-timeline-test]');
    expect(itemStates).not.toMatch(/:deep|::v-deep|!important/);
  });

  it('keeps canvas semantic controls transparent while preserving token-backed focus and trim limits', () => {
    const path = resolve(timelineRoot, 'TimelineCanvasClip.vue');
    const { descriptor } = parse(readFileSync(path, 'utf8'));
    const compiled = compileStyle({
      source: descriptor.styles[0]!.content,
      filename: path,
      id: 'data-v-controls',
      scoped: true,
    });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('background: transparent');
    expect(compiled.code).toContain('var(--color-timeline-selection)');
    expect(compiled.code).toContain('var(--color-error)');
    expect(compiled.code).toMatch(
      /\.canvas-clip-target\.disabled[^{}]*\{\s*opacity:\s*var\(--timeline-disabled-opacity\)/,
    );
    expect(descriptor.styles.every((style) => style.scoped)).toBe(true);
    expect(compiled.code).not.toMatch(/:deep|::v-deep|!important/);
  });

  it.each(items)('%s canvas controls retain the theme foreground and exact border-box hit geometry', (item) => {
    const controls = declarationsFor(`${item} canvas-clip-target`);
    expect(controls.get('color')).toBe('var(--text-primary)');
    expect(controls.get('box-sizing')).toBe('border-box');
    expect(controls.has('background')).toBe(false);
  });

  it('clips waveform pixels inside their semantic clip while painting the audio title as a separate foreground', () => {
    const path = resolve(timelineRoot, 'TimelineCanvasClip.vue');
    const { descriptor } = parse(readFileSync(path, 'utf8'));
    const style = compileStyle({
      source: descriptor.styles[0]!.content,
      filename: path,
      id: 'data-v-audio',
      scoped: true,
    });
    const declarations = (classes: string) => {
      const element = document.createElement('span');
      element.className = classes;
      element.setAttribute('data-v-audio', '');
      const values = new Map<string, string>();
      style.rawResult!.root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' || !element.matches(rule.selector)) return;
        rule.walkDecls((declaration) => {
          values.set(declaration.prop, declaration.value);
        });
      });
      return values;
    };
    expect(declarations('waveform').get('overflow')).toBe('hidden');
    expect(declarations('waveform').get('inset')).toBe('0');
    const label = declarations('audio-clip-label');
    expect(label.get('position')).toBe('absolute');
    expect(label.get('color')).toBe('var(--color-timeline-media-label-text)');
    expect(label.get('background')).toBe('var(--color-timeline-media-label)');
    expect(label.get('overflow')).toBe('hidden');
    expect(label.get('pointer-events')).toBe('none');
  });

  it.each(renderers)('%s imports the same scoped states without local state overrides', (filename) => {
    const path = resolve(timelineRoot, filename);
    const { descriptor } = parse(readFileSync(path, 'utf8'));
    expect(descriptor.styles.some((style) => style.scoped && style.src === './timeline-item-states.css')).toBe(true);
    for (const style of descriptor.styles) {
      if (style.src === './timeline-item-states.css') continue;
      const source = style.src ? readFileSync(resolve(dirname(path), style.src), 'utf8') : style.content;
      const local = compileStyle({
        source,
        filename: path,
        id: 'data-v-timeline-test',
        scoped: true,
      });
      expect(local.errors).toEqual([]);
      local.rawResult!.root.walkRules((rule) => {
        if (!rule.selector.match(/\.(?:selected|disabled|preview-ghost|dragging)|:hover|:focus-visible/)) return;
        rule.walkDecls((declaration) => {
          expect(declaration.value).not.toContain('--color-primary');
          expect(declaration.prop).not.toBe('opacity');
          if (rule.selector.includes('.selected')) {
            expect(['border', 'border-color', 'outline', 'box-shadow']).not.toContain(declaration.prop);
          }
        });
      });
    }
  });

  it.each(items)('%s shares the neutral selected border and preserves its type color', (item) => {
    const normal = declarationsFor(item);
    const selected = declarationsFor(`${item} selected`);
    expect(normal.get('border')).toBe('1px solid var(--color-timeline-item-border)');
    expect(selected.get('border')).toBe('2px solid var(--color-timeline-selection)');
    expect(selected.get('background')).toBe(normal.get('background'));
    expect(selected.get('box-shadow')).toBe('none');
    expect(selected.get('outline')).toBe('none');
  });

  it.each(['timeline-clip kind-audio', 'annotation-indicator'])('%s applies disabled opacity only once', (item) => {
    const row = declarationsFor('track-row disabled');
    const clip = declarationsFor(`${item} disabled`);
    expect(row.get('--timeline-item-opacity')).toBe('var(--timeline-disabled-opacity)');
    expect(row.has('opacity')).toBe(false);
    expect(clip.get('--timeline-item-opacity')).toBe(row.get('--timeline-item-opacity'));
    expect(clip.get('opacity')).toBe('var(--timeline-item-opacity, 1)');
  });

  it('shares drag and ghost opacity without a continuous ghost animation', () => {
    expect(declarationsFor('track-row dragging').get('opacity')).toBe('var(--timeline-drag-opacity)');
    expect(declarationsFor('sidebar-track-item dragging').get('opacity')).toBe('var(--timeline-drag-opacity)');
    const ghost = declarationsFor('annotation-indicator preview-ghost');
    expect(ghost.get('--timeline-item-opacity')).toBe('var(--timeline-ghost-opacity)');
    expect(ghost.get('border-style')).toBe('dashed');
    expect(ghost.has('animation')).toBe(false);
  });

  it('keeps a trim limit visible when the clip is selected', () => {
    expect(declarationsFor('timeline-clip selected trim-at-limit').get('border-color')).toBe('var(--color-error)');
    expect(declarationsFor('trim-handle at-limit').get('background')).toBe('var(--color-error)');
  });

  it('centralizes both palettes with much less tint behind the colored items', () => {
    const theme = compileStyle({
      source: timelineTheme,
      filename: 'timeline.css',
      id: 'timeline-theme',
    });
    expect(theme.errors).toEqual([]);
    const palettes = new Map<string, Map<string, string>>();
    theme.rawResult!.root.walkRules((rule) => {
      const values = new Map<string, string>();
      rule.walkDecls((declaration) => {
        values.set(declaration.prop, declaration.value);
      });
      palettes.set(rule.selector, values);
    });
    for (const selector of [':root', ':root.dark']) {
      const palette = palettes.get(selector)!;
      for (const role of ['video', 'audio', 'cursor', 'annotation', 'blur']) {
        expect(palette.has(`--color-track-${role}`)).toBe(true);
      }
      expect(parseFloat(palette.get('--timeline-lane-tint')!)).toBeLessThanOrEqual(5);
    }
    const light = palettes.get(':root')!;
    expect(parseFloat(light.get('--timeline-item-tint')!)).toBeGreaterThanOrEqual(30);
    expect(light.get('--color-timeline-selection')).toBe('var(--text-primary)');
    expect(timelineTheme).not.toContain('--color-primary');
  });
});
