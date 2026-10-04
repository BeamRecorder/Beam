import type { Clip, ClipComposition, MediaAsset } from '../shared/composition-types';
import type { CommandRegistry } from './command-types';
import { jsonObject } from '../document/json-value';

/** IDs are authored by the caller, making transactions reproducible across transports. */
export function registerAuthoringCommands(registry: CommandRegistry<ClipComposition>) {
  registry.register({
    type: 'asset.patch',
    parse(input) {
      const value = jsonObject(input),
        patch = jsonObject(value.patch);
      if (
        typeof value.assetId !== 'string' ||
        !value.assetId ||
        ['id', 'kind', 'origin', 'sessionId', 'sessionPath', 'sessionStartMs'].some((key) => key in patch)
      )
        throw new TypeError('Cannot change asset identity or origin.');
      return { id: value.assetId, patch };
    },
    apply(document, { id, patch }) {
      if (!document.assets.some((asset) => asset.id === id)) throw new Error('Unknown asset.');
      return {
        ...document,
        assets: document.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch } as MediaAsset) : asset)),
      };
    },
  });
  registry.register({
    type: 'asset.add',
    parse(input) {
      const value = jsonObject(input);
      if (
        typeof value.id !== 'string' ||
        !value.id ||
        typeof value.name !== 'string' ||
        typeof value.src !== 'string' ||
        !value.src ||
        !['project', 'session'].includes(value.origin as string) ||
        !(value.fileName === null || typeof value.fileName === 'string') ||
        ![value.width, value.height].every(
          (dimension) =>
            dimension === null || (typeof dimension === 'number' && Number.isFinite(dimension) && dimension > 0),
        )
      )
        throw new TypeError('Invalid asset authoring data.');
      return value as unknown as MediaAsset;
    },
    apply(document, asset) {
      if (document.assets.some((item) => item.id === asset.id)) throw new Error('Asset id already exists.');
      return { ...document, assets: [...document.assets, asset] };
    },
  });
  registry.register({
    type: 'asset.remove',
    parse(input) {
      const value = jsonObject(input);
      if (typeof value.assetId !== 'string') throw new TypeError('Asset requires an assetId.');
      return value.assetId;
    },
    apply(document, id) {
      if (document.clips.some((clip) => 'assetId' in clip && clip.assetId === id))
        throw new Error('Asset is still used by a clip.');
      if (!document.assets.some((asset) => asset.id === id)) throw new Error('Unknown asset.');
      return {
        ...document,
        assets: document.assets.filter((asset) => asset.id !== id),
      };
    },
  });
  registry.register({
    type: 'clip.add',
    parse(input) {
      const value = jsonObject(input);
      if (
        typeof value.id !== 'string' ||
        !value.id ||
        typeof value.name !== 'string' ||
        typeof value.enabled !== 'boolean'
      )
        throw new TypeError('Invalid clip authoring data.');
      return value as unknown as Clip;
    },
    apply(document, clip) {
      if (document.clips.some((item) => item.id === clip.id)) throw new Error('Clip id already exists.');
      return { ...document, clips: [...document.clips, clip] };
    },
  });
  registry.register({
    type: 'clip.patch',
    parse(input) {
      const value = jsonObject(input);
      if (typeof value.clipId !== 'string') throw new TypeError('Patch requires a clipId.');
      const patch = jsonObject(value.patch);
      if (
        ('name' in patch && typeof patch.name !== 'string') ||
        ('enabled' in patch && typeof patch.enabled !== 'boolean')
      )
        throw new TypeError('Invalid clip patch.');
      if (['id', 'kind'].some((key) => key in patch)) throw new TypeError('Cannot patch clip identity.');
      return { id: value.clipId, patch };
    },
    apply(document, { id, patch }) {
      if (!document.clips.some((clip) => clip.id === id)) throw new Error('Unknown clip.');
      return {
        ...document,
        clips: document.clips.map((clip) => (clip.id === id ? ({ ...clip, ...patch } as Clip) : clip)),
      };
    },
  });
}
