import type { CaptureProject } from '~/api/types/capture-api';

export type ProjectPickerProps = { compact: boolean; currentProjectId: string | null; active?: boolean };
export type ProjectPickerEvents = {
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
export type ProjectTitleProps = {
  project: ProjectIdentity;
  selectionMode: boolean;
};

export interface ProjectPickerSearchInput {
  inputRef: HTMLInputElement | null;
}

export type ProjectCardPreviewProps = {
  project: CaptureProject;
  thumbnailSrc?: string | null;
  hovered: boolean;
  loaded: boolean;
  current: boolean;
  selected: boolean;
  selectionMode: boolean;
  progress?: { current: number; total: number };
};
