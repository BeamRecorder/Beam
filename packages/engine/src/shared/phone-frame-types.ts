import type { ClipFrame } from '@beam/engine/shared/composition-types';

export type PhoneFrame = Extract<ClipFrame, 'iphone-16-max' | 'pixel-9-pro'>;

export const isPhoneFrame = (frame: ClipFrame): frame is PhoneFrame =>
  frame === 'iphone-16-max' || frame === 'pixel-9-pro';
