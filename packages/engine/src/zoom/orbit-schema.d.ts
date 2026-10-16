import type { OrbitCameraSettings } from './orbit-camera-types';
export const DEFAULT_ORBIT_SETTINGS: Readonly<OrbitCameraSettings>;
export const ORBIT_SETTING_LIMITS: Readonly<Record<keyof OrbitCameraSettings, readonly [number, number]>>;
export function validateOrbitSettings(value: unknown): void;
