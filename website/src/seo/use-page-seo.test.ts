import { createHead } from '@unhead/vue/client';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { renderDOMHead } from 'unhead/client';
import { usePageSeo } from './use-page-seo';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('usePageSeo', () => {
  it('updates structured data when its reactive source changes', async () => {
    const question = ref('Initial question');
    const component = defineComponent({
      setup() {
        usePageSeo({
          path: '/faq',
          title: 'FAQ',
          description: 'FAQ description',
          jsonLd: () => [
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: question.value,
                  acceptedAnswer: { '@type': 'Answer', text: 'Answer' },
                },
              ],
            },
          ],
        });
        return () => null;
      },
    });

    const head = createHead();
    const wrapper = mount(component, { global: { plugins: [head] } });
    await renderDOMHead(head);
    expect(document.querySelector('#beam-json-ld-1')?.textContent).toContain('Initial question');

    question.value = 'Updated question';
    await nextTick();
    await renderDOMHead(head);
    expect(document.querySelector('#beam-json-ld-1')?.textContent).toContain('Updated question');
    wrapper.unmount();
  });
});
