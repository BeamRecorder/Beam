/** An approximate scrub is refined only after the pointer has gone quiet. */
export class ScrubSettle {
  private timer: ReturnType<typeof setTimeout> | null = null;

  schedule(resolve: () => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      resolve();
    }, 120);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
