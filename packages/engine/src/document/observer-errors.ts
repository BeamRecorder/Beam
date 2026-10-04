/** Notification failures are recorded after commit; they never turn a committed edit into a retryable failure. */
export function createObserverErrors() {
  const errors: unknown[] = [];
  return {
    record(error: unknown) {
      errors.push(error);
      if (errors.length > 64) errors.shift();
    },
    take() {
      return errors.splice(0);
    },
  };
}
