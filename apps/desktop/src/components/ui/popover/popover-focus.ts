export function focusPopoverControl(root: HTMLElement, selector: string): () => void {
  const container = root.closest<HTMLElement>('.popover-content') ?? root;
  const focus = () => {
    const control = root.querySelector<HTMLElement>(selector);
    if (!control || control.closest('[inert]') || getComputedStyle(control).visibility === 'hidden') return false;
    control.focus();
    return true;
  };
  if (focus()) return () => {};
  const observer = new MutationObserver(() => {
    if (focus()) observer.disconnect();
  });
  observer.observe(container, { attributes: true, childList: true, subtree: true });
  return () => observer.disconnect();
}
