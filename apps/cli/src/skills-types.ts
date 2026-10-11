export interface BeamSkill {
  name: string;
  description: string;
  files: Record<string, string>;
}

export interface SkillsManifest {
  schemaVersion: 1;
  version: string;
  skills: BeamSkill[];
}

export interface SkillsSource {
  manifest: SkillsManifest;
  revision: string;
  read: (path: string) => Promise<Buffer>;
}

export interface InstalledSkill {
  schemaVersion: 1;
  repository: 'BeamRecorder/Beam';
  name: string;
  version: string;
  revision: string;
  files: Record<string, string>;
}

export type SkillStatus = 'missing' | 'current' | 'outdated' | 'modified' | 'conflict';

export interface SkillInspection {
  name: string;
  status: SkillStatus;
  installedVersion?: string;
}

export interface SkillsOptions {
  action: 'install' | 'check' | 'update';
  names: string[];
  directory: string;
  ref: string;
  source?: string;
  force: boolean;
}
