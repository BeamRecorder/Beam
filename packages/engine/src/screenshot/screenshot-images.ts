import type { ScreenshotState } from './screenshot-types';

export const screenshotImage = (state: ScreenshotState, id: string | null) =>
  id === state.image.id ? state.image : state.images?.find((image) => image.id === id);
