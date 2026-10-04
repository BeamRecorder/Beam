export type GradientStop = {
  id: string;
  position: number;
  color: string;
  alpha?: number;
};

export type GradientType = 'linear' | 'radial';

export type GradientValue = {
  type?: GradientType;
  angle?: number;
  stops: GradientStop[];
};

export type GradientPreset = {
  id: string;
  stops: GradientStop[];
};

export interface GradientProps {
  modelValue: GradientValue | null | undefined;
  presets?: GradientPreset[];
  minStops?: number;
  maxStops?: number;
  showAngle?: boolean;
  palette?: boolean;
  disabled?: boolean;
}

export interface GradientDrag {
  id: string;
  pointerId: number;
  originalPosition: number;
  position: number;
  pointerOffset: number;
}

export interface GradientStopsProps {
  stops: GradientStop[];
  selectedId: string | null;
  canAdd: boolean;
  disabled?: boolean;
}

export interface GradientStopRowProps {
  stop: GradientStop;
  index: number;
  selected: boolean;
  removable: boolean;
  palette?: boolean;
  disabled?: boolean;
}
