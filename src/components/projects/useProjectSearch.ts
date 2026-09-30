import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { ProjectPickerSearchInput } from './project-picker-types';

export function useProjectSearch(canTypeToSearch: () => boolean, cancelSelection: () => void) {
  const isSearchOpen = ref(false);
  const searchQuery = ref('');
  const searchInputRef = ref<ProjectPickerSearchInput | null>(null);

  const focusSearch = () => {
    void nextTick(() => {
      if (isSearchOpen.value) searchInputRef.value?.inputRef?.focus({ preventScroll: true });
    });
  };

  const toggleSearch = () => {
    cancelSelection();
    isSearchOpen.value = !isSearchOpen.value;
    if (isSearchOpen.value) focusSearch();
    else searchQuery.value = '';
  };

  const clearSearch = () => {
    searchQuery.value = '';
    searchInputRef.value?.inputRef?.focus({ preventScroll: true });
  };

  const handleSearchKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (searchQuery.value) searchQuery.value = '';
    else isSearchOpen.value = false;
  };

  const handleTyping = (event: KeyboardEvent) => {
    if (
      !canTypeToSearch() ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      event.key.length !== 1 ||
      (!searchQuery.value && !event.key.trim())
    )
      return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"]',
      )
    )
      return;

    event.preventDefault();
    cancelSelection();
    isSearchOpen.value = true;
    searchQuery.value += event.key;
    focusSearch();
  };

  onMounted(() => window.addEventListener('keydown', handleTyping));
  onUnmounted(() => window.removeEventListener('keydown', handleTyping));

  return { isSearchOpen, searchQuery, searchInputRef, toggleSearch, clearSearch, handleSearchKeydown };
}
