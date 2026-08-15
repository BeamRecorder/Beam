import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHudNavigation, areHudEntriesEqual } from '../useHudNavigation';

describe('useHudNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default hud entry and cannot go back or forward', () => {
    const nav = useHudNavigation({ attachListeners: false });
    expect(nav.currentEntry.value).toEqual({ view: 'hud' });
    expect(nav.showSettings.value).toBe(false);
    expect(nav.showProjectPicker.value).toBe(false);
    expect(nav.settingsView.value).toBe('general');
    expect(nav.canGoBack.value).toBe(false);
    expect(nav.canGoForward.value).toBe(false);
    expect(nav.history.value).toEqual([{ view: 'hud' }]);
    expect(nav.currentIndex.value).toBe(0);
  });

  it('navigates to settings and subviews correctly', () => {
    const nav = useHudNavigation({ attachListeners: false });

    nav.openSettings('general');
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });
    expect(nav.showSettings.value).toBe(true);
    expect(nav.settingsView.value).toBe('general');
    expect(nav.canGoBack.value).toBe(true);
    expect(nav.canGoForward.value).toBe(false);

    nav.setSettingsView('shortcuts');
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'shortcuts' });
    expect(nav.settingsView.value).toBe('shortcuts');

    nav.setSettingsView('about');
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'about' });
    expect(nav.settingsView.value).toBe('about');

    expect(nav.history.value).toHaveLength(4);
  });

  it('does not duplicate navigation when navigating to identical state', () => {
    const nav = useHudNavigation({ attachListeners: false });

    nav.openSettings('general');
    expect(nav.history.value).toHaveLength(2);

    nav.openSettings('general');
    expect(nav.history.value).toHaveLength(2);

    nav.navigateTo({ view: 'settings', subview: 'general' });
    expect(nav.history.value).toHaveLength(2);
  });

  it('supports going back and forward through the history stack', () => {
    const nav = useHudNavigation({ attachListeners: false });

    nav.openSettings('general');
    nav.setSettingsView('shortcuts');
    nav.openProjects();

    expect(nav.currentEntry.value).toEqual({ view: 'projects' });
    expect(nav.currentIndex.value).toBe(3);

    // Go back to shortcuts
    expect(nav.goBack()).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'shortcuts' });
    expect(nav.showSettings.value).toBe(true);
    expect(nav.settingsView.value).toBe('shortcuts');

    // Go back to general
    expect(nav.goBack()).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });
    expect(nav.settingsView.value).toBe('general');

    // Go back to hud
    expect(nav.goBack()).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'hud' });
    expect(nav.showSettings.value).toBe(false);

    // Cannot go back further
    expect(nav.goBack()).toBe(false);
    expect(nav.currentEntry.value).toEqual({ view: 'hud' });

    // Go forward
    expect(nav.goForward()).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    expect(nav.goForward()).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'shortcuts' });

    expect(nav.goForward()).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'projects' });

    // Cannot go forward further
    expect(nav.goForward()).toBe(false);
  });

  it('truncates forward history when a new navigation occurs from the middle of history', () => {
    const nav = useHudNavigation({ attachListeners: false });

    nav.openSettings('general');
    nav.setSettingsView('shortcuts');
    expect(nav.history.value).toHaveLength(3); // hud, settings-general, settings-shortcuts

    nav.goBack(); // at settings-general (index 1)
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    // Navigate to about
    nav.setSettingsView('about');
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'about' });
    expect(nav.history.value).toHaveLength(3); // hud, settings-general, settings-about
    expect(nav.canGoForward.value).toBe(false);
  });

  it('handles reactive showSettings and showProjectPicker setters', () => {
    const nav = useHudNavigation({ attachListeners: false });

    nav.showSettings.value = true;
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    nav.showSettings.value = false;
    expect(nav.currentEntry.value).toEqual({ view: 'hud' });

    nav.showProjectPicker.value = true;
    expect(nav.currentEntry.value).toEqual({ view: 'projects' });

    nav.showProjectPicker.value = false;
    expect(nav.currentEntry.value).toEqual({ view: 'hud' });
  });

  it('handles topbar back action hierarchically when history cannot go back', () => {
    const nav = useHudNavigation({
      initialEntry: { view: 'settings', subview: 'shortcuts' },
      attachListeners: false,
    });

    // History only has 1 item, so goBack is false. Fallback to settings general
    nav.handleTopbarBack();
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    // Fallback to hud
    nav.handleTopbarBack();
    expect(nav.currentEntry.value).toEqual({ view: 'hud' });

    // Starting from projects with no history
    const navProjects = useHudNavigation({
      initialEntry: { view: 'projects' },
      attachListeners: false,
    });
    navProjects.handleTopbarBack();
    expect(navProjects.currentEntry.value).toEqual({ view: 'hud' });
  });

  it('handles mouse navigation events with buttons 3 (back) and 4 (forward)', () => {
    const nav = useHudNavigation({ attachListeners: false });
    nav.openSettings('general');
    nav.setSettingsView('shortcuts');

    const preventDefaultMock = vi.fn();
    const stopPropagationMock = vi.fn();

    // Mouse back button (button 3)
    const backEvent = {
      button: 3,
      preventDefault: preventDefaultMock,
      stopPropagation: stopPropagationMock,
    } as unknown as MouseEvent;

    const handledBack = nav.handleMouseNavigation(backEvent);
    expect(handledBack).toBe(true);
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(stopPropagationMock).toHaveBeenCalled();
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    // Mouse forward button (button 4)
    const forwardEvent = {
      button: 4,
      preventDefault: preventDefaultMock,
      stopPropagation: stopPropagationMock,
    } as unknown as MouseEvent;

    const handledForward = nav.handleMouseNavigation(forwardEvent);
    expect(handledForward).toBe(true);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'shortcuts' });

    // Other mouse button (button 0 - left click)
    const leftClickEvent = {
      button: 0,
      preventDefault: preventDefaultMock,
      stopPropagation: stopPropagationMock,
    } as unknown as MouseEvent;

    const handledLeft = nav.handleMouseNavigation(leftClickEvent);
    expect(handledLeft).toBe(false);
  });

  it('attaches and detaches window listeners correctly', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const nav = useHudNavigation({ attachListeners: false });
    nav.attachWindowListeners();

    expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function), { capture: true });
    expect(addEventListenerSpy).toHaveBeenCalledWith('auxclick', expect.any(Function), { capture: true });

    nav.detachWindowListeners();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function), { capture: true });
    expect(removeEventListenerSpy).toHaveBeenCalledWith('auxclick', expect.any(Function), { capture: true });
  });

  it('debounces rapid mouseup events', () => {
    const nav = useHudNavigation({ attachListeners: false });
    nav.attachWindowListeners();
    nav.openSettings('general');
    nav.setSettingsView('shortcuts');

    const preventDefaultMock = vi.fn();
    const stopPropagationMock = vi.fn();

    const mouseEvent = new MouseEvent('mouseup', { button: 3 });
    mouseEvent.preventDefault = preventDefaultMock;
    mouseEvent.stopPropagation = stopPropagationMock;

    window.dispatchEvent(mouseEvent);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    // Rapid second event dispatched immediately should be ignored by the 60ms debounce window
    window.dispatchEvent(mouseEvent);
    expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

    nav.detachWindowListeners();
  });

  it('handles native pointer or mouse back/forward buttons but leaves ordinary buttons and inputs alone', () => {
    const nav = useHudNavigation({ attachListeners: false });
    nav.openSettings('general');
    nav.setSettingsView('shortcuts');
    nav.attachWindowListeners();

    const input = document.createElement('input');
    const inputMouseUp = vi.fn();
    input.addEventListener('mouseup', inputMouseUp);
    document.body.append(input);

    const dispatchButton = (target: EventTarget, type: 'pointerdown' | 'mouseup', button: number) => {
      const event =
        type === 'pointerdown' && typeof PointerEvent !== 'undefined'
          ? new PointerEvent(type, { button, bubbles: true, cancelable: true })
          : new MouseEvent(type, { button, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };

    try {
      const leftClick = dispatchButton(document, 'mouseup', 0);
      const middleClick = dispatchButton(document, 'mouseup', 1);
      const rightClick = dispatchButton(document, 'mouseup', 2);
      expect(leftClick.defaultPrevented).toBe(false);
      expect(middleClick.defaultPrevented).toBe(false);
      expect(rightClick.defaultPrevented).toBe(false);
      expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'shortcuts' });

      const back = dispatchButton(document, 'pointerdown', 3);
      expect(back.defaultPrevented).toBe(true);
      expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

      const forward = dispatchButton(document, 'mouseup', 4);
      expect(forward.defaultPrevented).toBe(true);
      expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'shortcuts' });

      nav.goBack();
      const inputBack = dispatchButton(input, 'mouseup', 3);
      expect(inputBack.defaultPrevented).toBe(false);
      expect(inputMouseUp).toHaveBeenCalledOnce();
      expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });

      const inputForward = dispatchButton(input, 'mouseup', 4);
      expect(inputForward.defaultPrevented).toBe(false);
      expect(inputMouseUp).toHaveBeenCalledTimes(2);
      expect(nav.currentEntry.value).toEqual({ view: 'settings', subview: 'general' });
    } finally {
      nav.detachWindowListeners();
      input.removeEventListener('mouseup', inputMouseUp);
      input.remove();
    }
  });

  it('compares HUD entries with areHudEntriesEqual correctly', () => {
    expect(areHudEntriesEqual({ view: 'hud' }, { view: 'hud' })).toBe(true);
    expect(areHudEntriesEqual({ view: 'hud' }, { view: 'projects' })).toBe(false);
    expect(areHudEntriesEqual({ view: 'settings', subview: 'general' }, { view: 'settings', subview: 'general' })).toBe(
      true,
    );
    expect(
      areHudEntriesEqual({ view: 'settings', subview: 'general' }, { view: 'settings', subview: 'shortcuts' }),
    ).toBe(false);
    expect(areHudEntriesEqual({ view: 'settings', subview: 'about' }, { view: 'projects' })).toBe(false);
  });
});
