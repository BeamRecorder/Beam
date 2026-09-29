import { expect, it } from 'vitest';
import { sidebarWidth, workspaceLayout, workspaceMode, panelRatios, proportionalPanels, workspaceDividerBounds } from './workspaceLayout';
it('starts with Concat proportions and uses the full client area', () => {
  const layout = workspaceLayout({ width: 1600, height: 1000 });
  expect(layout.library).toBeCloseTo((1584 - 16) * 0.31);
  expect(layout.inspector).toBeCloseTo((1584 - 16) * 0.22);
  expect(layout.preview + layout.library + layout.inspector + 16).toBe(1584);
  expect(layout.top + layout.timeline + 8).toBe(944);
});
it('bounds all dividers while retaining usable neighbouring panes', () => {
  const layout = workspaceLayout({ width: 1440, height: 900 }, { library: 9999, inspector: 9999, timeline: 9999 });
  expect(layout.library).toBeLessThanOrEqual(640); expect(layout.inspector).toBeLessThanOrEqual(520);
  expect(layout.preview).toBeGreaterThanOrEqual(280); expect(layout.top).toBeGreaterThanOrEqual(260);
  expect(layout.timeline).toBeLessThanOrEqual(640);
});
it.each([{ width: 640, height: 300 }, { width: 0, height: 0 }])('fits small clients without negative geometry %j', size => {
  const layout = workspaceLayout(size, { library: -1, inspector: NaN, timeline: Infinity });
  for (const value of Object.values(layout)) expect(value).toBeGreaterThanOrEqual(0);
  expect(layout.library + layout.inspector + layout.preview).toBeCloseTo(Math.max(0, layout.width - 16));
});
it('clamps the internal category divider and responds to parent resizing', () => {
  expect(sidebarWidth(440)).toBe(104); expect(sidebarWidth(440, -100)).toBe(88);
  expect(sidebarWidth(440, 999)).toBe(220); expect(sidebarWidth(120, 104)).toBe(60);
});
it('selects compact, split and wide layouts at stable boundaries', () => {
  expect([719, 720, 919, 920, 1259, 1260, 1920].map(workspaceMode)).toEqual(['compact','compact','compact','split','split','wide','wide']);
});
it('retains user split proportions through window resizing without accumulated drift', () => {
  const original = workspaceLayout({ width: 1600, height: 1000 }, { library: 500, inspector: 350, timeline: 380 });
  const ratios = panelRatios(original), size = { width: 1800, height: 1200 };
  const larger = workspaceLayout(size, proportionalPanels(size, ratios));
  expect(larger.library / (larger.width - 16)).toBeCloseTo(ratios.library);
  expect(larger.timeline / (larger.height - 8)).toBeCloseTo(ratios.timeline);
  expect(proportionalPanels(size)).toBeUndefined();
  for (const value of Object.values(panelRatios(workspaceLayout({ width: 0, height: 0 })))) expect(Number.isFinite(value)).toBe(true);
});

it('native column limits reserve the preview and the unchanged neighbouring pane', () => {
  const layout = workspaceLayout({ width: 1440, height: 900 });
  for (const divider of ['library', 'inspector'] as const) {
    const bounds = workspaceDividerBounds(layout, divider);
    for (const value of [bounds.minimum, bounds.maximum]) {
      const resized = workspaceLayout({ width: 1440, height: 900 }, { ...layout, [divider]: value });
      expect(resized[divider]).toBeCloseTo(value);
      expect(resized.preview).toBeGreaterThanOrEqual(280);
      expect(resized[divider === 'library' ? 'inspector' : 'library']).toBeCloseTo(layout[divider === 'library' ? 'inspector' : 'library']);
    }
  }
});

it('native row limits preserve space above and below the timeline', () => {
  const layout = workspaceLayout({ width: 1440, height: 900 });
  const bounds = workspaceDividerBounds(layout, 'timeline');
  expect(bounds.minimum).toBe(180);
  expect(bounds.maximum).toBeLessThanOrEqual(640);
  expect(layout.height - 8 - bounds.maximum).toBeGreaterThanOrEqual(260);
});

it.each([{ width: 0, height: 0 }, { width: 640, height: 300 }, { width: 1280, height: 480 }])('native bounds remain finite for small and empty clients %j', size => {
  const layout = workspaceLayout(size);
  for (const divider of ['library', 'inspector', 'timeline'] as const) {
    const bounds = workspaceDividerBounds(layout, divider);
    expect(Number.isFinite(bounds.minimum) && Number.isFinite(bounds.maximum)).toBe(true);
    expect(bounds.minimum).toBeGreaterThanOrEqual(0);
    expect(bounds.maximum + 1e-8).toBeGreaterThanOrEqual(bounds.minimum);
  }
});
