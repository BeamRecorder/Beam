import type { Component } from 'vue';

export interface PopoverMenuItem {
  id: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
  active?: boolean;
  children?: readonly PopoverMenuItem[];
}
