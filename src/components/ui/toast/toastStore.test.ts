import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('adds all supported toast types and removes them automatically', () => {
    const store = useToastStore();
    store.add('Info', 'info', 1000);
    store.addToast('Warning', 'warning', 0);
    store.success('Success', 0);
    store.error('Error', 0);
    expect(store.toasts).toHaveLength(4);
    const id = store.toasts[1].id;
    store.remove(id);
    expect(store.toasts.some((toast) => toast.id === id)).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(store.toasts).toHaveLength(2);
  });

  it('keeps action metadata and supports info without expiration', () => {
    const store = useToastStore();
    const onClick = vi.fn();
    store.info('With action', 0, { label: 'Retry', onClick });
    expect(store.toasts[0].action?.label).toBe('Retry');
    vi.advanceTimersByTime(5000);
    expect(store.toasts).toHaveLength(1);
  });

  it('deduplicates identical toasts, increments the count and resets the removal timer', () => {
    const store = useToastStore();
    const firstId = store.success('Copied', 1000, undefined, { leadingIcon: 'copy' });

    vi.advanceTimersByTime(900);
    const secondId = store.success('Copied', 1000, undefined, { leadingIcon: 'copy' });

    expect(secondId).toBe(firstId);
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0]).toMatchObject({ id: firstId, count: 2, revision: 1 });

    // The first timeout was replaced, so the toast remains for the new full duration.
    vi.advanceTimersByTime(999);
    expect(store.toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.toasts).toHaveLength(0);
  });

  it('does not deduplicate toasts when type, duration, action, or leading icon differs', () => {
    const store = useToastStore();
    const retry = vi.fn();

    store.success('Copied', 1000);
    store.success('Copied', 1000, { label: 'Retry', onClick: retry });
    store.error('Copied', 1000);
    store.success('Copied', 2000);
    store.success('Copied', 1000, undefined, { leadingIcon: 'copy' });
    store.success('Copied', 1000, undefined, { leadingIcon: 'paste' });

    expect(store.toasts).toHaveLength(6);
    expect(store.toasts.every((toast) => toast.count === 1 && toast.revision === 0)).toBe(true);
  });
});
