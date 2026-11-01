import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { usePreferencesStore } from '~/stores/preferences';
import { ELEMENT_ASSETS_KEY, isElementAsset, readElementAssets } from '@beam/engine/shared/element-assets';
import type { ElementAsset } from '@beam/engine/shared/element-asset-types';

export const useElementAssets = defineStore('element-assets', () => {
  const preferences = usePreferencesStore(),
    pending = ref(0);
  const assets = computed(() => readElementAssets(preferences.settings?.extras?.[ELEMENT_ASSETS_KEY]));
  let queue = Promise.resolve();
  const load = async () => {
    if (!preferences.settings) await preferences.load();
  };
  const change = (edit: (current: ElementAsset[]) => ElementAsset[]) => {
    pending.value++;
    const task = queue
      .then(async () => {
        await load();
        await preferences.update({ extras: { [ELEMENT_ASSETS_KEY]: edit(assets.value) } });
      })
      .finally(() => {
        pending.value--;
      });
    queue = task.catch(() => {});
    return task;
  };
  const add = (asset: ElementAsset) => {
    if (!isElementAsset(asset)) return Promise.reject(new TypeError('Invalid element asset'));
    const snapshot = readElementAssets([asset])[0]!;
    return change((current) => [...current.filter((item) => item.id !== snapshot.id), snapshot]);
  };
  const remove = (id: string) => change((current) => current.filter((item) => item.id !== id));
  return { assets, busy: computed(() => pending.value > 0), load, add, remove };
});
