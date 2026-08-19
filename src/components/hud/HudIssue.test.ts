import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HudIssue from './HudIssue.vue';
import type { HudIssueModel, HudIssueTone } from './hud-issue-types';

const issue = (tone: HudIssueTone, overrides: Partial<HudIssueModel> = {}): HudIssueModel => ({
  id: `issue-${tone}`,
  title: `${tone} issue`,
  details: ['First detail', 'Second detail'],
  tone,
  ...overrides,
});

describe('HudIssue', () => {
  it.each([
    ['error', 'alert', 'assertive'],
    ['warning', 'status', 'polite'],
    ['info', 'status', 'polite'],
    ['success', 'status', 'polite'],
  ] as const)('renders the %s tone with the correct accessible live region', (tone, role, live) => {
    const wrapper = mount(HudIssue, { props: { issue: issue(tone) } });
    const element = wrapper.get('.hud-issue');

    expect(element.classes()).toContain(`hud-issue-${tone}`);
    expect(element.attributes('role')).toBe(role);
    expect(element.attributes('aria-live')).toBe(live);
    expect(element.get('.hud-issue-icon').attributes('aria-hidden')).toBe('true');
  });

  it('renders a title and every diagnostic detail as a list', () => {
    const wrapper = mount(HudIssue, { props: { issue: issue('error', { title: 'Linux setup required' }) } });

    expect(wrapper.get('.hud-issue-title').text()).toBe('Linux setup required');
    expect(wrapper.findAll('.hud-issue-details li').map((detail) => detail.text())).toEqual([
      'First detail',
      'Second detail',
    ]);
  });

  it('emits the issue id when its action is clicked', async () => {
    const wrapper = mount(HudIssue, { props: { issue: issue('warning', { actionLabel: 'Authorize' }) } });

    await wrapper.get('.hud-issue-action').trigger('click');

    expect(wrapper.emitted('action')).toEqual([['issue-warning']]);
    expect(wrapper.find('.copy-button-idle').exists()).toBe(false);
  });

  it('renders copy actions as an icon-only CopyButton', () => {
    const wrapper = mount(HudIssue, {
      props: {
        issue: issue('error', {
          copyText: 'Fix details',
          copyLabel: 'Copy fix',
          copiedLabel: 'Copied',
        }),
      },
    });
    const copyButton = wrapper.get('.copy-button-idle');

    expect(copyButton.attributes('aria-label')).toBe('Copy fix');
    expect(copyButton.attributes('data-state')).toBe('idle');
    expect(copyButton.text()).toBe('');
    expect(copyButton.classes()).toContain('hud-issue-action');
    expect(copyButton.classes()).toContain('btn-icon-only');
  });

  it('disables and shows loading state for a pending action', () => {
    const wrapper = mount(HudIssue, {
      props: {
        issue: issue('warning', {
          actionLabel: 'Authorizing',
          actionLoading: true,
          actionDisabled: true,
        }),
      },
    });
    const action = wrapper.get('.hud-issue-action');

    expect(action.attributes('disabled')).toBeDefined();
    expect(action.text()).toContain('Authorizing');
    expect(action.find('.icon-spin').exists()).toBe(true);
  });

  it('renders no details list for an issue without details', () => {
    const wrapper = mount(HudIssue, { props: { issue: issue('info', { details: [] }) } });

    expect(wrapper.find('.hud-issue-details').exists()).toBe(false);
  });
});
