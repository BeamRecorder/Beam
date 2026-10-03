import { afterEach, expect, it, vi } from 'vitest';
import { focusPopoverControl } from './popover-focus';
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
const fixture = () => {
  document.body.innerHTML = '<div class="popover-content"><fieldset><input /></fieldset></div>';
  return {
    container: document.querySelector<HTMLElement>('.popover-content')!,
    root: document.querySelector('fieldset')!,
    input: document.querySelector('input')!,
  };
};
it('focuses a visible control immediately and supports a standalone root', () => {
  const f = fixture();
  const cancel = focusPopoverControl(f.root, 'input');
  expect(document.activeElement).toBe(f.input);
  cancel();
  f.container.className = '';
  focusPopoverControl(f.root, 'input')();
  expect(document.activeElement).toBe(f.input);
});
it('waits for positioning to reveal a hidden popover before moving focus', async () => {
  const f = fixture();
  f.container.style.visibility = 'hidden';
  const cancel = focusPopoverControl(f.root, 'input');
  expect(document.activeElement).not.toBe(f.input);
  f.container.style.visibility = 'visible';
  await Promise.resolve();
  expect(document.activeElement).toBe(f.input);
  cancel();
});
it('waits for a control to be mounted and no longer tracks changes after cancellation', async () => {
  const f = fixture();
  f.input.remove();
  const cancel = focusPopoverControl(f.root, 'input');
  const input = document.createElement('input');
  f.root.append(input);
  await Promise.resolve();
  expect(document.activeElement).toBe(input);
  input.blur();
  f.container.inert = true;
  f.container.setAttribute('inert', '');
  const blocked = focusPopoverControl(f.root, 'input');
  await Promise.resolve();
  expect(document.activeElement).not.toBe(input);
  blocked();
  f.container.removeAttribute('inert');
  await Promise.resolve();
  expect(document.activeElement).not.toBe(input);
  cancel();
});
