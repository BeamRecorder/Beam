import { createSignal, onCleanup } from 'solid-js';

/** One delayed hover task per trigger; exit, press and disposal cancel it. */
export function useTooltip(delay: () => number = () => 450) {
  const [open, setOpen] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const hide = () => { cancel(); setOpen(false); };
  const enter = () => {
    cancel();
    const requested = delay();
    timer = setTimeout(() => {
      timer = undefined;
      setOpen(true);
    }, Number.isFinite(requested) ? Math.max(0, Math.min(10_000, requested)) : 450);
  };
  onCleanup(cancel);
  return { open, enter, hide };
}
