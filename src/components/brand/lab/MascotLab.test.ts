import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MascotLab from './MascotLab.vue';
import BeamySvg from '../Beamy/BeamySvg.vue';
import MascotAppearance from './MascotAppearance.vue';
import MascotTimeline from './MascotTimeline.vue';
import Select from '~/ui/select/Select.vue';
import { createMascotEngine, DEFAULT_LOOK } from './mascot-catalog';
import type { MascotLook, MascotStep } from './mascot-types';
import { defaultPreset, PRESET_KEY } from './mascot-storage';
import { downloadBlob, mascotPng } from './mascot-export';

vi.mock('./mascot-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mascot-export')>()),
  downloadBlob: vi.fn(),
  mascotPng: vi.fn(async () => new Blob(['png'])),
}));

describe('standalone mascot laboratory', () => {
  const wrappers: ReturnType<typeof mount>[] = [];
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const setup = (embedded = false) => {
    const wrapper = mount(MascotLab, { props: { embedded } });
    wrappers.push(wrapper);
    return wrapper;
  };
  const click = async (wrapper: ReturnType<typeof mount>, label: string) => {
    const button = wrapper
      .findAll('button')
      .find((item) => item.text() === label || item.attributes('aria-label') === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    await button.trigger('click');
  };
  it('opens directly with the real SVG mascot and fourteen available states', () => {
    const wrapper = setup();
    expect(wrapper.find('[data-mascot-preview] svg').attributes('aria-label')).toContain('Au repos');
    expect(wrapper.findAll('.state-panel button')).toHaveLength(14);
    expect(wrapper.findAll('.step')).toHaveLength(4);
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/);
    expect(wrapper.get('.brand').attributes('href')).toBe('./mascot.html');
  });
  it('keeps the native panel entry when embedded while preserving lab controls', async () => {
    const wrapper = setup(true);
    expect(wrapper.get('.brand').attributes('href')).toBeUndefined();
    expect(wrapper.findAll('.state-panel button')).toHaveLength(14);
    await click(wrapper, 'Clin d’œil');
    expect(wrapper.find('[data-mascot-preview] svg').attributes('aria-label')).toContain('Clin d’œil');
  });
  it('selects a state, pauses with the keyboard, and steps through the catalogue', async () => {
    const wrapper = setup();
    await click(wrapper, 'Clin d’œil');
    expect(wrapper.find('[data-mascot-preview] svg').attributes('aria-label')).toContain('Clin d’œil');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    await nextTick();
    expect(wrapper.find('button[aria-label="Animer la mascotte"]').exists()).toBe(true);
    await click(wrapper, 'Mouvement suivant');
    expect(wrapper.text()).toContain('Émerveillement');
    await click(wrapper, 'Mouvement précédent');
    expect(wrapper.find('[data-mascot-preview] svg').attributes('aria-label')).toContain('Clin d’œil');
  });
  it('does not hijack the space key in controls', async () => {
    const wrapper = setup();
    await wrapper.find('input').trigger('keydown', { code: 'Space' });
    expect(wrapper.find('button[aria-label="Mettre en pause"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    await nextTick();
    expect(wrapper.find('button[aria-label="Mettre en pause"]').exists()).toBe(true);
  });
  it('renders a frozen state board and returns to one selected preview', async () => {
    const wrapper = setup();
    await click(wrapper, 'La planche');
    expect(wrapper.findAll('.state-board svg')).toHaveLength(14);
    expect(wrapper.find('button[aria-label="Animer la mascotte"]').attributes('disabled')).toBeDefined();
    await click(wrapper, 'Tester Comète');
    expect(wrapper.find('.state-board').exists()).toBe(false);
    expect(wrapper.find('[data-mascot-preview] svg').attributes('aria-label')).toContain('Comète');
  });
  it('updates all appearance controls and persists the selected look', async () => {
    const wrapper = setup();
    await click(wrapper, 'Nuage');
    await click(wrapper, 'Étoiles');
    await click(wrapper, 'Couleur #8b5cf6');
    await wrapper.find('input[aria-label="Couleur personnalisée au format hexadécimal"]').setValue('#123456');
    await wrapper.find('button[aria-label="Petites joues rosées"]').trigger('click');
    const saved = JSON.parse(localStorage.getItem(PRESET_KEY)!);
    expect(saved.look).toMatchObject({ shape: 'nuage', eyes: 'star', color: '#123456', blush: false });
    await wrapper.find('input[aria-label="Couleur personnalisée au format hexadécimal"]').setValue('invalid');
    expect(JSON.parse(localStorage.getItem(PRESET_KEY)!).look.color).toBe('#123456');
    expect(wrapper.text()).toContain('Utilise une couleur');
    await click(wrapper, 'Couleur #ff5a1f');
    expect(wrapper.text()).not.toContain('Utilise une couleur');
  });
  it('loads a saved look, reports corrupt storage, and resets only lab settings', async () => {
    const saved = defaultPreset();
    saved.look.eyes = 'star';
    localStorage.setItem(PRESET_KEY, JSON.stringify(saved));
    const wrapper = setup();
    expect((wrapper.getComponent(MascotAppearance).props('modelValue') as MascotLook).eyes).toBe('star');
    localStorage.setItem('other-settings', 'keep');
    await click(wrapper, 'Repartir de zéro');
    expect((wrapper.getComponent(MascotAppearance).props('modelValue') as MascotLook).eyes).toBe('sparkle');
    expect(localStorage.getItem('other-settings')).toBe('keep');
    localStorage.setItem(PRESET_KEY, '{}');
    expect(setup().find('[role="status"]').text()).toContain('relus'.slice(0, 4));
  });
  it('edits and reloads eye geometry while the real mascot preview is paused', async () => {
    const wrapper = setup(true);
    await click(wrapper, 'Mettre en pause');
    const before = wrapper.get('[data-mascot-preview] svg').html();
    await wrapper.get('input[aria-label="Taille des yeux"]').setValue('150');
    await wrapper.get('input[aria-label="Écartement des yeux"]').setValue('130');
    expect(wrapper.get('[data-mascot-preview] svg').html()).not.toBe(before);
    expect(wrapper.get('[data-mascot-preview] svg').html()).not.toMatch(/NaN|Infinity/);
    expect(JSON.parse(localStorage.getItem(PRESET_KEY)!).look.eyeGeometry).toMatchObject({ size: 1.5, spacing: 1.3 });
    const restored = setup(true);
    expect(restored.get<HTMLInputElement>('input[aria-label="Taille des yeux"]').element.value).toBe('150');
    expect(restored.get<HTMLInputElement>('input[aria-label="Écartement des yeux"]').element.value).toBe('130');
    await click(restored, 'Réinitialiser les yeux');
    expect(JSON.parse(localStorage.getItem(PRESET_KEY)!).look.eyeGeometry.size).toBe(1);
  });
  it('reports storage read and write failures instead of pretending to save', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const wrapper = setup();
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await click(wrapper, 'Étoiles');
    expect(wrapper.find('[role="status"]').text()).toContain('JSON');
  });
  it('exports SVG, PNG, and a reusable JSON preset', async () => {
    const wrapper = setup();
    await click(wrapper, 'SVG');
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'beam-mascot-idle.svg');
    await click(wrapper, 'PNG');
    await nextTick();
    expect(mascotPng).toHaveBeenCalledOnce();
    await click(wrapper, 'Exporter le look');
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'beam-mascot.json');
  });
  it('shows a failed export and lets the user retry', async () => {
    vi.mocked(mascotPng).mockRejectedValueOnce(new Error('PNG indisponible'));
    const wrapper = setup();
    await click(wrapper, 'PNG');
    await nextTick();
    expect(wrapper.find('[role="status"]').text()).toBe('PNG indisponible');
    await click(wrapper, 'SVG');
    expect(downloadBlob).toHaveBeenCalled();
  });
  it('plays and seeks the edited timeline', async () => {
    const wrapper = setup();
    await click(wrapper, 'Jouer la séquence');
    expect(wrapper.getComponent(MascotTimeline).props('sequencing')).toBe(true);
    await click(wrapper, 'Aller au mouvement 3 : En orbite');
    expect(wrapper.getComponent(MascotTimeline).props('active')).toBe(2);
    await click(wrapper, 'Déplacer le mouvement 3 à gauche');
    expect((wrapper.getComponent(MascotTimeline).props('modelValue') as MascotStep[])[1]!.state).toBe('orbit');
    await click(wrapper, 'Déplacer le mouvement 2 à droite');
    await click(wrapper, 'Retirer le mouvement 4');
    expect(wrapper.findAll('.step')).toHaveLength(3);
  });
  it('adds timed movements and changes the rest expression', async () => {
    const wrapper = setup();
    const timeline = wrapper.getComponent(MascotTimeline);
    timeline.findComponent(Select).vm.$emit('update:modelValue', 'comet');
    await nextTick();
    expect(wrapper.findAll('.step')).toHaveLength(5);
    await wrapper.find('input[aria-label="Durée du mouvement 5"]').setValue('3.2');
    expect((timeline.props('modelValue') as MascotStep[])[4]).toEqual({ state: 'comet', duration: 3.2 });
    wrapper.getComponent(MascotAppearance).findComponent(Select).vm.$emit('update:modelValue', 'heureux');
    await nextTick();
    expect((wrapper.getComponent(MascotAppearance).props('modelValue') as MascotLook).expression).toBe('heureux');
    expect(wrapper.find('[data-mascot-preview] svg').attributes('aria-label')).toContain('Au repos');
  });
  it('imports a valid preset and rejects oversize or malformed files', async () => {
    const wrapper = setup();
    const input = wrapper.find('input[type="file"]');
    const importFile = async (text: string, size = 100) => {
      Object.defineProperty(input.element, 'files', { configurable: true, value: [{ size, text: async () => text }] });
      await input.trigger('change');
      await nextTick();
    };
    const preset = defaultPreset();
    preset.look.shape = 'goutte';
    await importFile(JSON.stringify(preset));
    expect((wrapper.getComponent(MascotAppearance).props('modelValue') as MascotLook).shape).toBe('goutte');
    await importFile('{}');
    expect(wrapper.find('[role="status"]').text()).toContain('valides');
    await importFile('{}', 65537);
    expect(wrapper.find('[role="status"]').text()).toContain('volumineux');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [] });
    await input.trigger('change');
    expect((wrapper.getComponent(MascotAppearance).props('modelValue') as MascotLook).shape).toBe('goutte');
  });
});

describe('SVG rendering', () => {
  it.each(['idle', 'orbit', 'burst', 'notify', 'exclaim'] as const)(
    'renders %s with standalone definitions and valid geometry',
    (state) => {
      const wrapper = mount(BeamySvg, {
        props: { frame: createMascotEngine(DEFAULT_LOOK, state).sample(1), color: DEFAULT_LOOK.color, blush: true },
      });
      expect(wrapper.find('svg').attributes('viewBox')).toBe('-158 -158 316 316');
      expect(wrapper.html()).not.toMatch(/NaN|Infinity/);
      expect(wrapper.find('mask').exists()).toBe(true);
      wrapper.unmount();
    },
  );
});
