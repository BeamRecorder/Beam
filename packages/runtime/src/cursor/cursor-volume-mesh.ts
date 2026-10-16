/** The unchanged front cap is sufficient for 2D cursors, without reading their alpha back from the GPU. */
export function cursorFaceMesh(): Float32Array {
  return new Float32Array([
    0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0,
    1, 0, 1, 0, 0, 1, 0, 0, 1,
  ]);
}

/** An actual extruded alpha silhouette; the caps retain the original cursor artwork. */
export function cursorVolumeMesh(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  if (
    ![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 128) ||
    rgba.length !== width * height * 4
  )
    throw new RangeError('Invalid cursor silhouette.');
  const vertices: number[] = Array.from(cursorFaceMesh());
  const vertex = (x: number, y: number, z: number, u: number, v: number, nx: number, ny: number, nz: number) =>
    vertices.push(x, y, z, u, v, nx, ny, nz);
  const quad = (
    corners: readonly (readonly [number, number, number])[],
    uv: readonly (readonly [number, number])[],
    normal: readonly number[],
  ) => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = corners[index]!,
        tex = uv[index]!;
      vertex(...point, ...tex, normal[0]!, normal[1]!, normal[2]!);
    }
  };
  const capUV = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const;
  quad(
    [
      [0, 0, -0.18],
      [1, 0, -0.18],
      [1, 1, -0.18],
      [0, 1, -0.18],
    ],
    capUV,
    [0, 0, -1],
  );
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && rgba[(y * width + x) * 4 + 3]! >= 128;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      const sides = [
        [x - 1, y, x, y, x, y + 1, -1, 0],
        [x + 1, y, x + 1, y + 1, x + 1, y, 1, 0],
        [x, y - 1, x + 1, y, x, y, 0, -1],
        [x, y + 1, x, y + 1, x + 1, y + 1, 0, 1],
      ];
      for (const [nx, ny, x0, y0, x1, y1, normalX, normalY] of sides) {
        if (opaque(nx!, ny!)) continue;
        const a = [x0! / width, y0! / height] as const,
          b = [x1! / width, y1! / height] as const;
        const uv = [(x + 0.5) / width, (y + 0.5) / height] as const;
        quad(
          [
            [...a, 0],
            [...b, 0],
            [...b, -0.18],
            [...a, -0.18],
          ],
          [uv, uv, uv, uv],
          [normalX!, normalY!, 0],
        );
      }
    }
  return new Float32Array(vertices);
}
