import { describe, expect, it } from 'vitest';
import { propertiesPanelTitle } from './properties-panel-title';

const translations = {
  t: (key: string) => `generic:${key}`,
  tSidebar: (key: string) => `sidebar:${key}`,
  tTimeline: (key: string) => `timeline:${key}`,
  tTimelineToolbar: (key: string) => `toolbar:${key}`,
  tCanvas: (key: string) => `canvas:${key}`,
};

describe('propertiesPanelTitle', () => {
  it.each([
    ['screen', 'timeline:video'],
    ['video', 'timeline:video'],
    ['image', 'toolbar:image'],
    ['webcam', 'timeline:webcam'],
    ['color', 'canvas:color'],
    ['blur', 'timeline:blur'],
    ['caption', 'sidebar:captions'],
    ['audio', 'sidebar:audio'],
  ] as const)('keeps the %s title generic', (kind, expectedTitle) => {
    expect(propertiesPanelTitle('clip', kind, translations)).toBe(expectedTitle);
  });

  it('never uses the selected clip name as the panel title', () => {
    const selectedName = 'Figer la frame…';

    expect(propertiesPanelTitle('clip', 'screen', translations)).not.toContain(selectedName);
    expect(propertiesPanelTitle('clip', 'caption', translations)).not.toContain(selectedName);
  });
});
