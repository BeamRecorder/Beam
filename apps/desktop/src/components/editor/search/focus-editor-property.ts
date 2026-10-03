import type { EditorPropertyGroup } from './editor-search-types';

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const controls =
  'input:not(:disabled),button:not(:disabled),textarea:not(:disabled),[role="combobox"]:not([aria-disabled="true"])';
export function focusEditorProperty(
  label: string,
  root: Document | HTMLElement = document,
  section?: EditorPropertyGroup['section'],
): Promise<boolean> {
  const revealed = new Set<HTMLElement>();
  const available = (item: HTMLElement) =>
    !item.closest('[inert],[hidden],:disabled,[aria-disabled="true"],[aria-hidden="true"]') &&
    !item.matches(':disabled,[aria-disabled="true"]');
  const match = () => {
    const panel = root.querySelector<HTMLElement>('.properties-island');
    if (!panel) return false;
    const sectionButton =
      section && panel.querySelector<HTMLButtonElement>(`[data-editor-property-section="${section}"]`);
    if (sectionButton && available(sectionButton) && !revealed.has(sectionButton)) {
      revealed.add(sectionButton);
      sectionButton.click();
    }
    // Open only disclosures containing this property; their retained controls
    // are intentionally inert while collapsed.
    const candidates = [...panel.querySelectorAll<HTMLElement>('[aria-label],label,span,h3,h4')].filter(
      (item) => normalize(item.getAttribute('aria-label') ?? item.textContent ?? '') === normalize(label),
    );
    for (const candidate of candidates) {
      let accordion = candidate.closest<HTMLElement>('.accordion');
      while (accordion) {
        const trigger = accordion.querySelector<HTMLButtonElement>('.accordion-heading > .accordion-trigger');
        if (trigger?.getAttribute('aria-expanded') === 'false' && available(trigger) && !revealed.has(trigger)) {
          revealed.add(trigger);
          trigger.click();
          return false;
        }
        accordion = accordion.parentElement?.closest<HTMLElement>('.accordion') ?? null;
      }
    }
    const named = [...panel.querySelectorAll<HTMLElement>('[aria-label]')].find(
      (item) => available(item) && normalize(item.getAttribute('aria-label') ?? '') === normalize(label),
    );
    const text = [...panel.querySelectorAll<HTMLElement>('label,span,h3,h4')].find(
      (item) => available(item) && normalize(item.textContent ?? '') === normalize(label),
    );
    const block =
      named ??
      text?.closest<HTMLElement>(
        'label,.big-slider-container,.option,.prop-row,.property-row,.section-block,.control-group,.accordion-heading',
      ) ??
      text;
    if (block && available(block)) {
      if (block.hasAttribute('data-editor-property-edit')) {
        if (!revealed.has(block)) {
          revealed.add(block);
          block.click();
        }
        return false;
      }
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
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    if (match()) finish(true);
  });
}
