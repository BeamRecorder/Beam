export interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  position: number;
}

export interface AlignmentTarget {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

const SAFE_MARGIN = 0.05; // 5% safe area margin

export function computeCanvasAlignmentSnapping(
  moved: { x: number; y: number; width: number; height: number },
  otherTargets: AlignmentTarget[],
  threshold = 0.015,
): SnapResult {
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;
  let snappedX = moved.x;
  let snappedY = moved.y;
  const guides: AlignmentGuide[] = [];

  // Canvas edge, center, and safe margin targets
  const vTargets = new Set<number>([0, SAFE_MARGIN, 0.5, 1.0 - SAFE_MARGIN, 1.0]);
  const hTargets = new Set<number>([0, SAFE_MARGIN, 0.5, 1.0 - SAFE_MARGIN, 1.0]);

  for (const target of otherTargets) {
    vTargets.add(target.x);
    vTargets.add(target.x + target.width / 2);
    vTargets.add(target.x + target.width);

    hTargets.add(target.y);
    hTargets.add(target.y + target.height / 2);
    hTargets.add(target.y + target.height);
  }

  const itemLeft = moved.x;
  const itemCenterX = moved.x + moved.width / 2;
  const itemRight = moved.x + moved.width;

  const itemTop = moved.y;
  const itemCenterY = moved.y + moved.height / 2;
  const itemBottom = moved.y + moved.height;

  // Check vertical (X axis) snap targets
  for (const targetX of vTargets) {
    const dLeft = Math.abs(itemLeft - targetX);
    if (dLeft < threshold && dLeft < bestDx) {
      bestDx = dLeft;
      snappedX = targetX;
    }
    const dCenter = Math.abs(itemCenterX - targetX);
    if (dCenter < threshold && dCenter < bestDx) {
      bestDx = dCenter;
      snappedX = targetX - moved.width / 2;
    }
    const dRight = Math.abs(itemRight - targetX);
    if (dRight < threshold && dRight < bestDx) {
      bestDx = dRight;
      snappedX = targetX - moved.width;
    }
  }

  if (bestDx <= threshold) {
    const curLeft = snappedX;
    const curCenterX = snappedX + moved.width / 2;
    const curRight = snappedX + moved.width;

    for (const targetX of vTargets) {
      if (
        Math.abs(curLeft - targetX) < 0.001 ||
        Math.abs(curCenterX - targetX) < 0.001 ||
        Math.abs(curRight - targetX) < 0.001
      ) {
        guides.push({ type: 'vertical', position: targetX });
      }
    }
  }

  // Check horizontal (Y axis) snap targets
  for (const targetY of hTargets) {
    const dTop = Math.abs(itemTop - targetY);
    if (dTop < threshold && dTop < bestDy) {
      bestDy = dTop;
      snappedY = targetY;
    }
    const dCenter = Math.abs(itemCenterY - targetY);
    if (dCenter < threshold && dCenter < bestDy) {
      bestDy = dCenter;
      snappedY = targetY - moved.height / 2;
    }
    const dBottom = Math.abs(itemBottom - targetY);
    if (dBottom < threshold && dBottom < bestDy) {
      bestDy = dBottom;
      snappedY = targetY - moved.height;
    }
  }

  if (bestDy <= threshold) {
    const curTop = snappedY;
    const curCenterY = snappedY + moved.height / 2;
    const curBottom = snappedY + moved.height;

    for (const targetY of hTargets) {
      if (
        Math.abs(curTop - targetY) < 0.001 ||
        Math.abs(curCenterY - targetY) < 0.001 ||
        Math.abs(curBottom - targetY) < 0.001
      ) {
        guides.push({ type: 'horizontal', position: targetY });
      }
    }
  }

  return {
    x: snappedX,
    y: snappedY,
    guides,
  };
}
