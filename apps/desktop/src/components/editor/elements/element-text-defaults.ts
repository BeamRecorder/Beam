import { createElementText, isElementText } from '@beam/engine/shared/element-text';
import type { ElementText } from '@beam/engine/shared/element-types';
import type { ElementTextDefaults } from './element-text-default-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function normalizeElementTextDefaults(value: unknown): ElementTextDefaults | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const text = { ...value, content: '' } as ElementText;
  if (!isElementText(text)) return undefined;
  const { customText: _content, ...style } = text.style;
  return clone({ style, padding: text.padding, verticalAlign: text.verticalAlign });
}

export function elementTextFromDefaults(content: string, defaults: ElementTextDefaults | undefined): ElementText {
  return { ...(defaults ? clone(defaults) : createElementText()), content };
}
