import type { BackgroundValue } from '@beam/engine/shared/background-types';

export interface BackgroundDeleteDialogProps {
  target: BackgroundValue | null;
  preview?: string;
  busy: boolean;
  error: string;
}
