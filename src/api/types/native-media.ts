export interface NativeMediaDevice {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface NativeMediaDevices {
  cameras: NativeMediaDevice[];
  microphones: NativeMediaDevice[];
  systemOutputs: NativeMediaDevice[];
  errors: { cameras: string | null; microphones: string | null; systemOutputs: string | null };
}
