import type { Effects } from '../shared/editorTypes';
export type LibraryPage = 'media' | 'text' | 'transitions' | 'effects' | 'filters' | 'templates';
export type MediaFilter = 'all' | 'video' | 'audio' | 'images' | 'recordings';
export interface EffectPreset { id: string; values: Partial<Effects> }
