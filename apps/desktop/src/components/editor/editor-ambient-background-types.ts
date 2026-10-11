import type { BackgroundValue } from '@beam/engine/shared/background-types';

export interface EditorAmbientBackgroundProps {
  background: BackgroundValue | null;
  variant?: 'ambient' | 'workspace';
}
