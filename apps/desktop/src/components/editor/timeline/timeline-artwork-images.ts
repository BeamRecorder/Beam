import type {
  TimelineArtworkImageEntry,
  TimelineArtworkImagesOptions,
  TimelineArtworkImageLease,
} from './timeline-artwork-images-types';

/** Decode once per source URL. Borrowed pixels stay alive; only idle entries are evicted. */
export class TimelineArtworkImages {
  private readonly entries = new Map<string, TimelineArtworkImageEntry>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly createImage: () => HTMLImageElement;
  private bytes = 0;
  private disposed = false;
  constructor(options: TimelineArtworkImagesOptions = {}) {
    this.maxEntries = options.maxEntries ?? 96;
    this.maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
    if (
      !Number.isSafeInteger(this.maxEntries) ||
      this.maxEntries < 1 ||
      !Number.isSafeInteger(this.maxBytes) ||
      this.maxBytes < 4
    )
      throw new RangeError('Invalid timeline artwork image budget.');
    this.createImage = options.createImage ?? (() => new Image());
  }
  acquire(url: string): TimelineArtworkImageLease {
    if (this.disposed) throw new Error('Timeline artwork images disposed.');
    let entry = this.entries.get(url);
    if (!entry) {
      const image = this.createImage();
      let resolve!: (value: HTMLImageElement) => void, reject!: (error: Error) => void;
      const ready = new Promise<HTMLImageElement>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      entry = { image, ready, reject, refs: 1, bytes: 0, pending: true };
      const owned = entry;
      image.onload = () => {
        if (this.entries.get(url) !== owned || this.disposed) return;
        if (![image.naturalWidth, image.naturalHeight].every((v) => Number.isSafeInteger(v) && v > 0)) {
          this.remove(url, owned, new Error('Timeline artwork image has invalid dimensions.'));
          return;
        }
        owned.pending = false;
        owned.bytes = image.naturalWidth * image.naturalHeight * 4;
        this.bytes += owned.bytes;
        image.onload = image.onerror = null;
        resolve(image);
        this.trim();
      };
      image.onerror = () => {
        if (this.entries.get(url) !== owned) return;
        this.remove(url, owned, new Error('Timeline artwork image failed to load.'));
      };
      this.entries.set(url, entry);
      image.src = url;
    } else entry.refs += 1;
    if (this.entries.get(url) === entry) {
      this.entries.delete(url);
      this.entries.set(url, entry);
    }
    const owned = entry;
    let released = false;
    return {
      ready: entry.ready,
      release: () => {
        if (released) return;
        released = true;
        owned.refs -= 1;
        this.trim();
      },
    };
  }
  private remove(url: string, entry: TimelineArtworkImageEntry, error?: Error): void {
    this.entries.delete(url);
    this.bytes -= entry.bytes;
    entry.image.onload = entry.image.onerror = null;
    entry.image.src = '';
    if (entry.pending) {
      entry.pending = false;
      entry.reject(error ?? new Error('Timeline artwork image evicted.'));
    }
  }
  private trim(): void {
    for (const [url, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.bytes <= this.maxBytes) break;
      if (!entry.refs) this.remove(url, entry);
    }
  }
  stats() {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      active: [...this.entries.values()].filter((e) => e.refs > 0).length,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [url, entry] of this.entries) this.remove(url, entry, new Error('Timeline artwork images disposed.'));
  }
}
