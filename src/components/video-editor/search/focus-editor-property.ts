const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const controls =
  'input:not(:disabled),button:not(:disabled),textarea:not(:disabled),[role="combobox"]:not([aria-disabled="true"])';
export function focusEditorProperty(label: string, root: Document | HTMLElement = document): Promise<boolean> {
  const revealed = new Set<HTMLElement>();
  const available = (item: HTMLElement) =>
    !item.closest('[inert],[hidden],:disabled,[aria-disabled="true"],[aria-hidden="true"]') &&
    !item.matches(':disabled,[aria-disabled="true"]');
  const match = () => {
    const panel = root.querySelector<HTMLElement>('.properties-island');
    if (!panel) return false;
    const named = [...panel.querySelectorAll<HTMLElement>('[aria-label]')].find(
      (item) => available(item) && normalize(item.getAttribute('aria-label') ?? '') === normalize(label),
    );
    const text = [...panel.querySelectorAll<HTMLElement>('label,span,h3,h4')].find(
      (item) => available(item) && normalize(item.textContent ?? '') === normalize(label),
    );
    const block =
      named ??
      text?.closest<HTMLElement>('label,.big-slider-container,.option,.prop-row,.section-block,.control-group') ??
      text;
    if (block && available(block)) {
      const target = block.matches(controls)
        ? block
        : ([...block.querySelectorAll<HTMLElement>(controls)].find(available) ?? block);
      if (!target.matches(controls)) target.setAttribute('tabindex', '-1');
      target.scrollIntoView?.({ block: 'center' });
      target.focus({ preventScroll: true });
      return true;
    }
    panel
      .querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-controls*="advanced"]')
      .forEach((button) => {
        if (available(button) && !revealed.has(button)) {
          revealed.add(button);
          button.click();
        }
      });
    return false;
  };
  if (match()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (found: boolean) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(found);
    };
    const observer = new MutationObserver(() => {
      if (match()) finish(true);
    });
    const timer = setTimeout(() => finish(false), 800);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    if (match()) finish(true);
  });
}
