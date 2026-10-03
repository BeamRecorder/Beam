import type { Component } from 'vue';
export interface CommandPaletteItem {
  id: string;
  label: string;
  detail?: string;
  icon?: Component;
  terms?: string[];
  disabled?: boolean;
  children?: CommandPaletteItem[];
  run?: () => void | Promise<void>;
}
