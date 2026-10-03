import type { Component } from 'vue';

export interface ContextMenuItemOption {
  id: string;
  label: string;
  icon?: Component;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}

export type ContextMenuItemOrDivider = ContextMenuItemOption | { isDivider: true; id?: string; label?: never };

export interface ContextMenuPosition {
  x: number;
  y: number;
}
