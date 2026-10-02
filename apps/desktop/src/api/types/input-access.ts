export interface InputAccessError {
  code: string;
  message: string;
}

export interface InputAccessStatus {
  state: 'available' | 'permission-required' | 'installation-required' | 'unavailable' | 'denied';
  canRequest: boolean;
  clicks: boolean;
  shortcuts: boolean;
  recordsText: false;
  unavailableReason?: 'input-helper-unavailable' | 'polkit-unavailable' | 'input-broker-unavailable';
  mouseDevices?: number;
  keyboardDevices?: number;
  error?: InputAccessError;
}
