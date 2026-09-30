import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, mascotPng, serializeMascot } from './mascot-export';

describe('mascot exports', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mascot'), revokeObjectURL: vi.fn() });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const svg = () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    element.setAttribute('viewBox', '-158 -158 316 316');
    element.setAttribute('class', 'hero');
    element.innerHTML = '<path d="M0 0L1 1Z" fill="#ff5a1f" />';
    return element;
  };
  it('serializes a standalone SVG with a transparent background', () => {
    const exported = serializeMascot(svg());
    expect(exported).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(exported).toContain('width="512"');
    expect(exported).toContain('height="512"');
    expect(exported).not.toContain('class=');
    expect(exported).not.toContain('<rect');
  });
  it('retains its viewBox and artwork', () => {
    expect(serializeMascot(svg())).toContain('viewBox="-158 -158 316 316"');
    expect(serializeMascot(svg())).toContain('fill="#ff5a1f"');
  });
  it('leaves the live preview untouched', () => {
    const element = svg();
    serializeMascot(element);
    expect(element.getAttribute('class')).toBe('hero');
    expect(element.hasAttribute('width')).toBe(false);
  });
  it('downloads the requested filename and revokes the URL after the click', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('mascot.svg');
      expect(this.href).toBe('blob:mascot');
    });
    downloadBlob(new Blob(['svg']), 'mascot.svg');
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mascot');
  });
  const image = (success: boolean) => {
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        onerror?: () => void;
        set src(_: string) {
          queueMicrotask(() => (success ? this.onload?.() : this.onerror?.()));
        }
      },
    );
  };
  it('renders a PNG at 1024 pixels and releases the source URL', async () => {
    image(true);
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      expect(this.width).toBe(1024);
      expect(this.height).toBe(1024);
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    expect((await mascotPng(serializeMascot(svg()))).type).toBe('image/png');
    expect(draw).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('reports decoding failures and still revokes the URL', async () => {
    image(false);
    await expect(mascotPng('broken')).rejects.toThrow('convertir');
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('reports an unavailable canvas and releases the URL', async () => {
    image(true);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(mascotPng('svg')).rejects.toThrow('navigateur');
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('reports a failed PNG encoder and releases the URL', async () => {
    image(true);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
    await expect(mascotPng('svg')).rejects.toThrow('échoué');
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
