export interface BigSliderProps {
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  defaultValue?: number;
  formatValue?: (value: number) => string;
  displayPrecision?: number;
}
