import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusEditorProperty } from '../focus-editor-property';
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});
describe('focus editor property', () => {
  it('reveals nested accordions from the outer section to the requested field', async () => {
    document.body.innerHTML =
      '<section class="properties-island"><section class="accordion"><div class="accordion-heading"><button class="accordion-trigger" aria-expanded="false">Appearance</button></div><div class="accordion-content" inert><section class="accordion"><div class="accordion-heading"><button class="accordion-trigger" aria-expanded="false">Shadow</button></div><div class="accordion-content" inert><input aria-label="Shadow blur"></div></section></div></section></section>';
    const order: string[] = [];
    for (const trigger of document.querySelectorAll<HTMLButtonElement>('.accordion-trigger')) {
      trigger.addEventListener('click', () => {
        order.push(trigger.textContent!);
        trigger.setAttribute('aria-expanded', 'true');
        trigger.parentElement!.nextElementSibling!.removeAttribute('inert');
      });
    }
    expect(await focusEditorProperty('Shadow blur')).toBe(true);
    expect(order).toEqual(['Appearance', 'Shadow']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Shadow blur');
  });

  it('reveals a section selected by its heading and focuses its disclosure button', async () => {
    document.body.innerHTML =
      '<section class="properties-island"><section class="accordion"><div class="accordion-heading"><button class="accordion-trigger" aria-expanded="false"><span>Crop</span></button></div><div inert></div></section></section>';
    const trigger = document.querySelector<HTMLButtonElement>('button')!;
    trigger.addEventListener('click', () => {
      trigger.setAttribute('aria-expanded', 'true');
      trigger.parentElement!.nextElementSibling!.removeAttribute('inert');
    });
    expect(await focusEditorProperty('Crop')).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
  it('reveals only the accordion containing a requested retained field', async () => {
    document.body.innerHTML =
      '<section class="properties-island"><section class="accordion"><div class="accordion-heading"><button class="accordion-trigger" aria-expanded="false">Shadow</button></div><div class="accordion-content" inert><input aria-label="Shadow blur"></div></section><section class="accordion"><div class="accordion-heading"><button class="accordion-trigger" aria-expanded="false">Crop</button></div></section></section>';
    const trigger = document.querySelector<HTMLButtonElement>('.accordion-trigger')!;
    const click = vi.fn(() => {
      trigger.setAttribute('aria-expanded', 'true');
      document.querySelector('.accordion-content')!.removeAttribute('inert');
    });
    trigger.addEventListener('click', click);
    expect(await focusEditorProperty('Shadow blur')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Shadow blur');
    expect(document.querySelectorAll('.accordion-trigger')[1]!.getAttribute('aria-expanded')).toBe('false');
  });
  it('does not reopen a disabled accordion or escape a locked parent', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="properties-island"><fieldset disabled><section class="accordion"><div class="accordion-heading"><button class="accordion-trigger" aria-expanded="false">Crop</button></div><div inert><input aria-label="Crop edge"></div></section></fieldset></section>';
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    const pending = focusEditorProperty('Crop edge');
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('focuses the first numeric control when a compact property row is selected', async () => {
    document.body.innerHTML =
      '<section class="properties-island"><div class="property-row"><span>Size</span><input aria-label="Width"><input aria-label="Height"></div></section>';
    expect(await focusEditorProperty('Size')).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Width');
  });
  it('activates a single-click editable title and focuses its input after Vue replaces the button', async () => {
    document.body.innerHTML =
      '<section class="properties-island"><button aria-label="Layer name" data-editor-property-edit>Callout</button></section>';
    const button = document.querySelector('button')!;
    const click = vi.fn(() =>
      queueMicrotask(() => {
        button.outerHTML = '<input aria-label="Layer name">';
      }),
    );
    button.addEventListener('click', click);
    expect(await focusEditorProperty('Layer name')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(document.activeElement?.tagName).toBe('INPUT');
  });
  it('does not reactivate an editable title repeatedly when it cannot produce a field', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="properties-island"><button aria-label="Layer name" data-editor-property-edit>Callout</button></section>';
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    const pending = focusEditorProperty('Layer name');
    document.querySelector('button')!.setAttribute('data-updated', 'true');
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });
  it('does not edit a locked layer title', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="properties-island"><button disabled aria-label="Layer name" data-editor-property-edit>Callout</button></section>';
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    const pending = focusEditorProperty('Layer name');
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it.each(['appearance', 'text'] as const)(
    'reveals the %s pane before focusing its property, without repeating the tab switch',
    async (section) => {
      document.body.innerHTML = `<section class="properties-island"><button data-editor-property-section="${section}">Pane</button></section>`;
      const button = document.querySelector('button')!;
      const click = vi.fn(() =>
        document.querySelector('section')!.insertAdjacentHTML('beforeend', '<input aria-label="Requested">'),
      );
      button.addEventListener('click', click);
      expect(await focusEditorProperty('Requested', document, section)).toBe(true);
      expect(click).toHaveBeenCalledOnce();
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Requested');
    },
  );
  it('does not activate disabled section tabs to reveal unavailable properties', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="properties-island"><button disabled data-editor-property-section="text">Text</button></section>';
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    const pending = focusEditorProperty('Requested', document, 'text');
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
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
