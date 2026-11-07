import type { ZoomAutoFollowSettings } from '@beam/engine/zoom/zoom-types';

/** Both preview painters must invalidate the same retained camera settings. */
export const cameraFollowInputs = (settings?: ZoomAutoFollowSettings) =>
  [settings?.enabled !== false, settings?.safeZone, settings?.responsiveness, settings?.directionLock] as const;
