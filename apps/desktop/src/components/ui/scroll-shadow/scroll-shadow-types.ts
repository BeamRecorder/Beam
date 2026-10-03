import type { Ref } from 'vue';

export type ScrollOrientation = 'vertical' | 'horizontal' | 'both';

export interface ScrollShadowOptions {
  /**
   * Offset threshold in pixels before a shadow activates.
   * Default is 2px to avoid subpixel flickering.
   */
  offset?: number;
  /**
   * Direction of scrolling to track.
   * Default is 'vertical'.
   */
  orientation?: ScrollOrientation;
  /**
   * Whether shadow calculation is enabled.
   */
  isEnabled?: Ref<boolean> | boolean;
}

export interface ScrollShadowReturn {
  hasTopShadow: Ref<boolean>;
  hasBottomShadow: Ref<boolean>;
  hasLeftShadow: Ref<boolean>;
  hasRightShadow: Ref<boolean>;
  isScrollableY: Ref<boolean>;
  isScrollableX: Ref<boolean>;
  updateShadows: () => void;
}
