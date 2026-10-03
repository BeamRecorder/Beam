export type DragTarget = 'triangle' | 'ring' | 'standard-sv' | 'standard-hue' | 'standard-alpha' | null;

export interface PickerPoint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorPickerProps {
  modelValue?: string;
  label?: string;
  inline?: boolean;
  hideHeader?: boolean;
  eyedropperLabel?: string;
  formatLabel?: string;
  type?: 'standard' | 'triangle';
  alphaValue?: number;
  showAlpha?: boolean;
  showLabel?: boolean;
  disabled?: boolean;
  disabledReasonKey?: string;
  disabledReason?: string;
}
