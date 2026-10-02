import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusEditorProperty } from '../focus-editor-property';
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});
describe('focus editor property', () => {
  it('focuses accented accessible controls and scrolls the matching property into view', async () => {
    document.body.innerHTML = '<section class="properties-island"><input aria-label="Opacité"></section>';
    const input = document.querySelector('input')!;
    input.scrollIntoView = vi.fn();
    expect(await focusEditorProperty('opacite')).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.scrollIntoView).toHaveBeenCalled();
  });
  it('finds controls through their visible label or focuses a section without a control', async () => {
    document.body.innerHTML =
      '<section class="properties-island"><label><span>Radius</span><input></label><h3>Layout</h3></section>';
    expect(await focusEditorProperty('radius')).toBe(true);
    expect(document.activeElement?.tagName).toBe('INPUT');
    expect(await focusEditorProperty('Layout')).toBe(true);
    expect(document.activeElement?.tagName).toBe('H3');
  });
  it('waits for mounted panels, opens Advanced once and waits for the real requested control', async () => {
    const pending = focusEditorProperty('Shadow');
    document.body.innerHTML =
      '<section class="properties-island"><button aria-expanded="false" aria-controls="clip-advanced">Advanced</button></section>';
    const button = document.querySelector('button')!;
    const click = vi.fn(() => {
      document.querySelector('section')!.insertAdjacentHTML('beforeend', '<input aria-label="Shadow">');
    });
    button.addEventListener('click', click);
    expect(await pending).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Shadow');
  });
  it('does not focus inert, hidden or disabled controls and times out cleanly', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="properties-island"><fieldset disabled><input aria-label="Volume"></fieldset><div inert><span>Volume</span></div><input hidden aria-label="Volume"><button disabled aria-expanded="false" aria-controls="advanced">Advanced</button></section>';
    const pending = focusEditorProperty('Volume');
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBe(false);
    document.body.innerHTML = '';
    const missing = focusEditorProperty('Unknown');
    await vi.advanceTimersByTimeAsync(800);
    expect(await missing).toBe(false);
  });
});
