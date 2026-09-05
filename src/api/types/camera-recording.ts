export type CameraPlacement = { x: number; y: number; width: number; height: number };

export type CameraFormat = { codec: 'vp8'; width: number; height: number; nominalFps: number };

export type CameraAppearance = {
  shadowSize: 'none' | 'sm' | 'md' | 'lg';
  cornerRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
};

export type CameraRecordingControl =
  | { action: 'prepare'; sourceId: string }
  | {
      action: 'start';
      recordingId: string;
      sessionId: string;
      startNs: number;
      appearance?: CameraAppearance;
      placement?: CameraPlacement;
    }
  | { action: 'pause'; recordingId: string; endNs: number }
  | { action: 'resume'; recordingId: string; sessionId: string; startNs: number }
  | { action: 'stop'; recordingId: string; endNs: number }
  | { action: 'fail'; recordingId: string; sessionId: string; reason: string };

export type CameraRecordingControlResult = { recordingId: string; sourceId: string; format: CameraFormat } | undefined;

export type CameraRecordingCommand = {
  commandId: string;
  recordingId: string;
  control: CameraRecordingControl;
};

export type CameraRecordingCommandResult = {
  commandId: string;
  ok: boolean;
  value?: CameraRecordingControlResult;
  error?: { name: string; message: string };
};

export type CameraRecordingFailure = { recordingId: string; message: string };
