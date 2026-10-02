import { describe, expect, it, vi } from 'vitest';
import enCore from './en/core.json';
import enEditor from './en/editor.json';
import { createLocaleLoader } from './locale-loader';

const english = { ...enCore, ...enEditor };
const fixture = () => {
  const core = vi.fn(async () => enCore);
  const editor = vi.fn(async () => enEditor);
  const load = createLocaleLoader({ './fr/core.json': core }, { './fr/editor.json': editor }, english);
  return { core, editor, load };
};

describe('locale loading', () => {
  it('uses bundled English without requesting another language', async () => {
    const f = fixture();
    expect(await f.load('en')).toBe(english);
    expect(f.core).not.toHaveBeenCalled();
    expect(f.editor).not.toHaveBeenCalled();
  });
  it('shares concurrent requests and caches a complete language', async () => {
    const f = fixture();
    const first = f.load('fr');
    expect(f.load('fr')).toBe(first);
    expect(await first).toEqual(english);
    expect(await f.load('fr')).toBe(await first);
    expect(f.core).toHaveBeenCalledOnce();
    expect(f.editor).toHaveBeenCalledOnce();
  });
  it('reports incomplete language manifests without loading half a catalog', async () => {
    const f = fixture();
    await expect(f.load('ja')).rejects.toThrow('Translations unavailable for ja');
    const load = createLocaleLoader({ './fr/core.json': f.core }, {}, english);
    await expect(load('fr')).rejects.toThrow('Translations unavailable for fr');
    expect(f.core).not.toHaveBeenCalled();
  });
  it('retries failed imports and never caches incomplete translations', async () => {
    const f = fixture();
    f.editor.mockRejectedValueOnce(new Error('Chunk unavailable'));
    await expect(f.load('fr')).rejects.toThrow('Chunk unavailable');
    expect(await f.load('fr')).toEqual(english);
    expect(f.core).toHaveBeenCalledTimes(2);
    expect(f.editor).toHaveBeenCalledTimes(2);
  });
});
