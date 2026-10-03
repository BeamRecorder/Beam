export const TRI_RADIUS = 58;
export const CANVAS_SIZE = 160;

export function drawColorTriangle(canvas: HTMLCanvasElement | null, hueColor: string) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const center = CANVAS_SIZE / 2;
  const R = TRI_RADIUS;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const v1 = { x: center + R, y: center };
  const v2 = { x: center - R / 2, y: center - (R * Math.sqrt(3)) / 2 };
  const v3 = { x: center - R / 2, y: center + (R * Math.sqrt(3)) / 2 };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(v1.x, v1.y);
  ctx.lineTo(v2.x, v2.y);
  ctx.lineTo(v3.x, v3.y);
  ctx.closePath();
  ctx.clip();

  const grayGrad = ctx.createLinearGradient(v2.x, v2.y, v2.x, v3.y);
  grayGrad.addColorStop(0, '#ffffff');
  grayGrad.addColorStop(1, '#000000');
  ctx.fillStyle = grayGrad;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const hueGrad = ctx.createLinearGradient(v1.x, v1.y, v2.x, v1.y);
  hueGrad.addColorStop(0, hueColor);
  hueGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = hueGrad;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.restore();
}
