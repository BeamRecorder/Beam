import type { gsap } from 'gsap';
export type DemoTheme = 'light' | 'dark';
export type DemoStyle = '2d' | '3d' | 'glass';
export interface Pose { time: number }
export interface SceneHandle { ready: Promise<void>; paint(): void }
export interface PointerStop { at: number; x: number; y: number }
export interface DemoWindow extends Window {
  __timelines: Record<string, gsap.core.Timeline>;
  beamComposition: { ready: Promise<void>; timeline: gsap.core.Timeline; seek(ms: number): Promise<void> };
}
