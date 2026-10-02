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
