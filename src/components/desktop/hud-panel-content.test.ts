import { describe, expect, it, vi } from 'vitest';
const views = vi.hoisted(() => ({
  projects: { name: 'Projects' },
  settings: { name: 'Settings' },
}));
vi.mock('../projects/ProjectPicker.vue', () => ({ default: views.projects }));
vi.mock('../hud/settings/HudSettingsWindow.vue', () => ({ default: views.settings }));
import { loadHudPanelContent, readHudPanel } from './hud-panel-content';

describe('HUD panel content loading', () => {
  it.each(['projects', 'settings'] as const)('loads the selected %s view', async (panel) => {
    expect(readHudPanel(`?panel=${panel}`)).toBe(panel);
    await expect(loadHudPanelContent(panel)).resolves.toBe(views[panel]);
  });
  it.each(['', '?panel=unknown', '?panel=mascot', '?panel=Projects', '?other=settings'])(
    'rejects an unrecognized role (%s)',
    (query) => {
      expect(readHudPanel(query)).toBeNull();
    },
  );
  it('does not load a view when the role is missing', async () => {
    await expect(loadHudPanelContent(null)).resolves.toBeNull();
  });
  it('reads encoded roles independently of other query parameters', () => {
    expect(readHudPanel('?other=projects&panel=%73ettings&extra=1')).toBe('settings');
  });
});
