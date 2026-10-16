import type { HoverDifference, HoverPoint } from './hover-types';

const segmentDistance = (x: number, y: number, a: HoverPoint, b: HoverPoint, width: number, height: number) => {
  const ax = a.x * width;
  const ay = a.y * height;
  const dx = (b.x - a.x) * width;
  const dy = (b.y - a.y) * height;
  const progress = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * progress, y - ay - dy * progress);
};

/** Conservative evidence of a newly changing local control along the recorded pointer path. */
export function detectsCursorHover(
  grid: HoverDifference,
  previousGrid: Uint8Array | null,
  previous: HoverPoint | null,
  current: HoverPoint | null,
): boolean {
  const { width, height, pixels } = grid;
  if (
    !previous?.active ||
    !current?.active ||
    current.time <= previous.time ||
    current.time - previous.time > 0.1 ||
    Math.hypot((current.x - previous.x) * width, (current.y - previous.y) * height) < 0.03
  )
    return false;
  const count = width * height;
  if (
    ![width, height].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 64) ||
    pixels.length !== count * 4 ||
    (previousGrid && previousGrid.length !== pixels.length)
  )
    throw new RangeError('Invalid hover difference grid.');
  const changed = new Uint8Array(count);
  const rows = new Set<number>();
  const columns = new Set<number>();
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (pixels[index * 4]! < 24) continue;
    changed[index] = 1;
    rows.add(Math.floor(index / width));
    columns.add(index % width);
    total++;
  }
  // A scroll or scene change affects widely distributed rows, unlike a list highlight.
  if (total > count * 0.3 || (rows.size > height * 0.65 && columns.size > width * 0.3)) return false;
  const queue = new Int32Array(count);
  for (let seed = 0; seed < count; seed++) {
    if (!changed[seed]) continue;
    let head = 0;
    let tail = 1;
    queue[0] = seed;
    changed[seed] = 0;
    let novelty = 0;
    let near = false;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (head < tail) {
      const cell = queue[head++]!;
      const x = cell % width;
      const y = Math.floor(cell / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (!previousGrid || previousGrid[cell * 4]! < 24) novelty++;
      near ||= segmentDistance(x + 0.5, y + 0.5, previous, current, width, height) <= 1.5;
      for (const neighbor of [x > 0 ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1, cell - width, cell + width]) {
        if (neighbor < 0 || neighbor >= count || !changed[neighbor]) continue;
        changed[neighbor] = 0;
        queue[tail++] = neighbor;
      }
    }
    // Reject a caret, tall moving media, and persistent independent animation.
    if (near && tail >= 2 && novelty / tail >= 0.25 && maxY - minY < height * 0.4 && (maxX > minX || maxY - minY >= 2))
      return true;
  }
  return false;
}
