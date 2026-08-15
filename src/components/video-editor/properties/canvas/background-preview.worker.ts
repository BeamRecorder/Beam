const MAX_CONCURRENT = 4;
let activeCount = 0;
let queue: Array<{ id: string; source: string }> = [];

self.onmessage = (event: MessageEvent) => {
  const { type, id, source } = event.data;
  if (type === 'request' && typeof id === 'string' && typeof source === 'string') {
    if (!queue.some((entry) => entry.id === id)) {
      queue.push({ id, source });
    }
    pump();
  }
  if (type === 'clear') {
    queue = [];
  }
};

function pump() {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    activeCount += 1;
    void processItem(next).finally(() => {
      activeCount -= 1;
      pump();
    });
  }
}

async function processItem(item: { id: string; source: string }) {
  try {
    const response = await fetch(item.source);
    if (!response.ok) throw new Error('Preview source unavailable');
    const image = await createImageBitmap(await response.blob(), {
      resizeWidth: 240,
      resizeHeight: 180,
      resizeQuality: 'low',
    });
    const canvas = new OffscreenCanvas(240, 180);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Preview canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const preview = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
    self.postMessage({ type: 'ready', id: item.id, preview });
  } catch {
    self.postMessage({ type: 'error', id: item.id });
  }
}
