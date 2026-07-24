let queue: Array<{ id: string; source: string }> = [];
let processing = false;

self.onmessage = (event: MessageEvent) => {
  const { type, id, source } = event.data;
  if (type === "request" && typeof id === "string" && typeof source === "string") {
    if (!queue.some((entry) => entry.id === id)) {
      queue.push({ id, source });
    }
    processNext();
  }
  if (type === "clear") {
    queue = [];
  }
};

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;
  const next = queue.shift();
  if (!next) return;
  try {
    const response = await fetch(next.source);
    if (!response.ok) throw new Error("Preview source unavailable");
    const image = await createImageBitmap(await response.blob(), {
      resizeWidth: 240,
      resizeHeight: 180,
      resizeQuality: "low",
    });
    const canvas = new OffscreenCanvas(240, 180);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Preview canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const preview = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
    self.postMessage({ type: "ready", id: next.id, preview });
  } catch {
    self.postMessage({ type: "error", id: next.id });
  } finally {
    processing = false;
    processNext();
  }
}
