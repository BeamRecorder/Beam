import type { CaptureProject } from '~/api/types/capture-api';

export type ProjectPickerProps = { compact: boolean; currentProjectId: string | null };
export type ProjectPickerEvents = {
  back: [];
  'open-project': [project: CaptureProject];
  'select-project': [project: CaptureProject];
  'rename-project': [project: CaptureProject];
  'delete-project': [project: CaptureProject];
  'toggle-popover': [isOpen: boolean];
};
export type ProjectPickerEmit = <K extends keyof ProjectPickerEvents>(
  event: K,
  ...args: ProjectPickerEvents[K]
) => void;
export type ProjectIdentity = Pick<CaptureProject, 'id' | 'name' | 'mode'>;
