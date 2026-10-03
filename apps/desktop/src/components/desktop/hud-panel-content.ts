import type { Component } from 'vue';
import type { HudPanel } from '~/api/types/hud-panel';

export function readHudPanel(search: string): HudPanel | null {
  const panel = new URLSearchParams(search).get('panel');
  if (panel === 'settings' || panel === 'projects') return panel;
  return panel === 'mascot' && import.meta.env.DEV ? panel : null;
}

export async function loadHudPanelContent(panel: HudPanel | null): Promise<Component | null> {
  switch (panel) {
    case 'projects':
      return (await import('../projects/ProjectPicker.vue')).default;
    case 'settings':
      return (await import('../hud/settings/HudSettingsWindow.vue')).default;
    case 'mascot':
      return import.meta.env.DEV ? (await import('../brand/lab/MascotLab.vue')).default : null;
    default:
      return null;
  }
}
