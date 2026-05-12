import { describe, it, expect } from 'vitest';
import { buildFullScopePrompt, buildSectionRegenPrompt } from '../scoping-prompt.js';

describe('buildFullScopePrompt()', () => {
  it('SP-01: Firewall requirement with all context fields includes guidance and context lines', () => {
    const { system, user } = buildFullScopePrompt({
      requirement_text: 'Need firewall policy review and hardening for branch offices.',
      domain_hint: 'FIREWALL',
      context: {
        os: 'Windows Server 2022',
        tools: 'Cisco ASDM 7.x',
        environment: 'Hybrid branch network with VPN tunnels',
        constraints: 'Maintenance window Saturday 10pm-2am AEST',
      },
    });

    expect(system).toContain('PRICING GUIDANCE for FIREWALL');
    expect(system).toMatch(/AUD 400[-–]2,000/);
    expect(user).toContain('Operating system / platform: Windows Server 2022');
    expect(user).toContain('Existing tools / software: Cisco ASDM 7.x');
    expect(user).toContain('Environment details: Hybrid branch network with VPN tunnels');
    expect(user).toContain('Constraints / timeline: Maintenance window Saturday 10pm-2am AEST');
  });

  it('SP-02: no context provided has no undefined/null lines', () => {
    const { user } = buildFullScopePrompt({
      requirement_text: 'Need secure firewall baseline and policy cleanup across environment.',
    });

    expect(user).not.toMatch(/undefined|null/);
  });

  it('SP-03: CYBERSECURITY domain includes cybersecurity pricing range', () => {
    const { system } = buildFullScopePrompt({
      requirement_text: 'Need cyber risk assessment and remediation scope.',
      domain_hint: 'CYBERSECURITY',
    });

    expect(system).toMatch(/AUD 1,500[-–]8,000/);
  });

  it('SP-04: USD currency hint is included in user message', () => {
    const { user } = buildFullScopePrompt({
      requirement_text: 'Need server hardening and CIS baseline.',
      domain_hint: 'LINUX',
      currency: 'USD',
    } as never);

    expect(user).toContain('Customer preferred currency: USD');
    expect(user).toContain('price field should be in USD');
  });

  it('SP-05: system prompt contains Return ONLY valid JSON instruction', () => {
    const { system } = buildFullScopePrompt({
      requirement_text: 'Need Office 365 tenant review and security baseline.',
    });

    expect(system).toContain('Return ONLY valid JSON');
  });
});

describe('buildSectionRegenPrompt()', () => {
  const currentScope = {
    title: 'Firewall Policy Review and Hardening',
    domain: 'FIREWALL',
    objective: 'Review and harden firewall policy with measurable risk reduction.',
    in_scope: ['Review ACL rules', 'Remove unused rules'],
    price: 950,
    currency: 'AUD',
  };

  it('SP-06: in_scope with feedback includes feedback and current context', () => {
    const { user } = buildSectionRegenPrompt(
      'in_scope',
      currentScope,
      'Please add explicit validation and rollback tasks.',
    );

    expect(user).toContain('Customer feedback for this regeneration');
    expect(user).toContain('Current scope context:');
    expect(user).toContain('Current in_scope:');
  });

  it('SP-07: price section system instruction references price field', () => {
    const { system } = buildSectionRegenPrompt('price', currentScope);
    expect(system).toContain('"price"');
  });

  it('SP-08: no feedback omits feedback line', () => {
    const { user } = buildSectionRegenPrompt('deliverables', currentScope);
    expect(user).not.toContain('Customer feedback for this regeneration');
  });
});
