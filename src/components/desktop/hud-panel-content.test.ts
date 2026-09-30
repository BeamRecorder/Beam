import { afterEach, describe, expect, it, vi } from 'vitest';
const views = vi.hoisted(() => ({
  projects: { name: 'Projects' },
  settings: { name: 'Settings' },
  mascot: { name: 'MascotLab' },
}));
vi.mock('../projects/ProjectPicker.vue', () => ({ default: views.projects }));
vi.mock('../hud/settings/HudSettingsWindow.vue', () => ({ default: views.settings }));
vi.mock('../brand/lab/MascotLab.vue', () => ({ default: views.mascot }));
import { loadHudPanelContent, readHudPanel } from './hud-panel-content';
afterEach(() => vi.unstubAllEnvs());

describe('HUD panel content loading', () => {
  it.each(['projects', 'settings', 'mascot'] as const)('loads the selected %s view', async (panel) => {
    expect(readHudPanel(`?panel=${panel}`)).toBe(panel);
    await expect(loadHudPanelContent(panel)).resolves.toBe(views[panel]);
  });
  it.each(['', '?panel=unknown', '?panel=Projects', '?other=settings'])(
    'rejects an unrecognized role (%s)',
    (query) => {
      expect(readHudPanel(query)).toBeNull();
    },
  );
  it('does not load or recognize Mascot Lab in a production renderer', async () => {
    vi.stubEnv('DEV', false);
    expect(readHudPanel('?panel=mascot')).toBeNull();
    await expect(loadHudPanelContent('mascot')).resolves.toBeNull();
    expect(readHudPanel('?panel=settings')).toBe('settings');
  });
  it('does not load a view when the role is missing', async () => {
    await expect(loadHudPanelContent(null)).resolves.toBeNull();
  });
  it('reads encoded roles independently of other query parameters', () => {
    expect(readHudPanel('?other=projects&panel=%73ettings&extra=1')).toBe('settings');
  });
});
