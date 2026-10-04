export interface InputUnitOption {
  value: string;
  label: string;
}
export interface InputUnitSelectProps {
  modelValue: string;
  options: InputUnitOption[];
  label: string;
  disabled?: boolean;
}
export interface InputProps {
  modelValue: string | number;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean | string;
  id?: string;
  size?: 'xs' | 'sm' | 'md';
  width?: string;
  height?: string;
  min?: number;
  max?: number;
  step?: number;
  autofocus?: boolean;
  selectOnFocus?: boolean;
  debounce?: number;
  commitOnBlur?: boolean;
  appearance?: 'default' | 'neutral';
  unit?: string;
  unitOptions?: InputUnitOption[];
  unitLabel?: string;
}
