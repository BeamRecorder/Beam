import type { gsap } from 'gsap';
export type DemoKind = 'glass' | 'automatic';
export type DemoTheme = 'light' | 'dark';
export interface Pose { time: number; x: number; y: number; camera: number }
export interface SceneHandle { ready: Promise<void>; paint(): void }
export interface DemoWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: { ready: Promise<void>; timeline: gsap.core.Timeline; seek(ms: number): Promise<void> };
}
