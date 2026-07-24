const cachedTimes = new Set<number>();
let queue: number[] = [];
let processing = false;

self.onmessage = (event: MessageEvent) => {
  const { type, time, visibleTimes, blob } = event.data;

  if (type === "request-frames") {
    queue = [...new Set<number>(visibleTimes ?? [])]
      .filter((value) => !cachedTimes.has(value));
    requestNext();
    return;
  }

  if (type === "frame-response") {
    if (blob) {
      cachedTimes.add(time);
      self.postMessage({ type: "frame-ready", time, blob });
    }
    processing = false;
    requestNext();
    return;
  }

  if (type === "clear") {
    cachedTimes.clear();
    queue = [];
    processing = false;
  }
};

function requestNext() {
  if (processing || queue.length === 0) return;
  const time = queue.shift();
  if (time === undefined) return;
  processing = true;
  self.postMessage({ type: "extract-frame", time });
}
