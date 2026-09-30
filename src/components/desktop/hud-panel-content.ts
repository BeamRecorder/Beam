import type { Component } from 'vue';
import type { HudPanel } from '~/api/types/hud-panel';

export function readHudPanel(search: string): HudPanel | null {
  const panel = new URLSearchParams(search).get('panel');
  return panel === 'settings' || panel === 'projects' ? panel : null;
}

export async function loadHudPanelContent(panel: HudPanel | null): Promise<Component | null> {
  switch (panel) {
    case 'projects':
      return (await import('../projects/ProjectPicker.vue')).default;
    case 'settings':
      return (await import('../hud/settings/HudSettingsWindow.vue')).default;
    default:
      return null;
  }
}
