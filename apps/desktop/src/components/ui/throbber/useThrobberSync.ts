import { ref, onMounted, onBeforeUnmount, getCurrentInstance, type Ref } from 'vue';

export const THROBBER_BASE_PERIOD_MS = 1400;

let activeSubscribers = 0;
let rafId: number | null = null;
const globalTime: Ref<number> = ref(typeof performance !== 'undefined' ? performance.now() : 0);

function updateLoop(timestamp: number) {
  globalTime.value = timestamp;
  if (activeSubscribers > 0) {
    rafId = requestAnimationFrame(updateLoop);
  } else {
    rafId = null;
  }
}

export function startThrobberClock(): void {
  activeSubscribers += 1;
  if (activeSubscribers === 1 && typeof requestAnimationFrame !== 'undefined') {
    rafId = requestAnimationFrame(updateLoop);
  }
}

export function stopThrobberClock(): void {
  activeSubscribers = Math.max(0, activeSubscribers - 1);
  if (activeSubscribers === 0 && rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function getThrobberGlobalTime(): Ref<number> {
  return globalTime;
}

export function useThrobberSync() {
  if (getCurrentInstance()) {
    onMounted(() => {
      startThrobberClock();
    });
    onBeforeUnmount(() => {
      stopThrobberClock();
    });
  }

  return {
    globalTime,
    startThrobberClock,
    stopThrobberClock,
    basePeriodMs: THROBBER_BASE_PERIOD_MS,
  };
}
