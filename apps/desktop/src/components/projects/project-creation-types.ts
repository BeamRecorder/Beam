import type { CreateProjectOptions } from '~/api/types/capture-config';
import type { CaptureProject } from '~/api/types/capture-api';

export type NewProjectMode = NonNullable<CreateProjectOptions['mode']>;
export interface ProjectCreationOptions {
  refresh: () => Promise<void>;
  open: (project: CaptureProject) => void;
}
