import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMessageMock } = vi.hoisted(() => ({
  createMessageMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMessageMock },
  })),
}));

import { ClaudeApiError, generateScope, generateScopeSection } from '../claude-api.service.js';

function validScope() {
  return {
    title: 'Cisco ASA Firewall Policy Review and Hardening',
    domain: 'FIREWALL',
    objective:
      'Review and harden firewall policy to reduce risk, remove unused rules, and deliver a validated secure baseline for production deployment.',
    in_scope: [
      'Review existing ACL and object groups',
      'Identify and remove stale or redundant firewall rules',
      'Apply hardened policy updates with rollback plan',
    ],
    out_of_scope: ['Hardware replacement', 'Network redesign'],
    assumptions: ['Customer provides admin access', 'Change window is approved'],
    prerequisites: ['Firewall backup available'],
    deliverables: ['Audit report', 'Hardened policy configuration'],
    currency: 'AUD',
    price: 950,
    hours_min: 6,
    hours_max: 10,
    milestone_count: 1,
  };
}

describe('generateScope()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CA-01: valid JSON matching scope schema returns parsed + rawText', async () => {
    const payload = JSON.stringify(validScope());
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: payload }],
    });

    const result = await generateScope('sys', 'usr');

    expect(result.parsed).toMatchObject(validScope());
    expect(result.rawText).toBe(payload);
  });

  it('CA-02: markdown fenced JSON is stripped and parsed correctly', async () => {
    const payload = JSON.stringify(validScope(), null, 2);
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: `\`\`\`json\n${payload}\n\`\`\`` }],
    });

    const result = await generateScope('sys', 'usr');

    expect(result.parsed).toMatchObject(validScope());
  });

  it('CA-03: invalid JSON throws ClaudeApiError PARSE_FAILURE non-retryable', async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: '{not valid json}' }],
    });

    await expect(generateScope('sys', 'usr')).rejects.toMatchObject({
      name: 'ClaudeApiError',
      code: 'PARSE_FAILURE',
      retryable: false,
    });
  });

  it('CA-04: valid JSON failing Zod validation throws VALIDATION_FAILURE non-retryable', async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Too short payload' }) }],
    });

    await expect(generateScope('sys', 'usr')).rejects.toMatchObject({
      name: 'ClaudeApiError',
      code: 'VALIDATION_FAILURE',
      retryable: false,
    });
  });

  it('CA-05: SDK 429 throws RATE_LIMITED retryable', async () => {
    createMessageMock.mockRejectedValue({ status: 429, message: 'rate limit' });

    await expect(generateScope('sys', 'usr')).rejects.toMatchObject({
      name: 'ClaudeApiError',
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('CA-06: SDK 500 throws API_ERROR retryable', async () => {
    createMessageMock.mockRejectedValue({ status: 500, message: 'server error' });

    await expect(generateScope('sys', 'usr')).rejects.toMatchObject({
      name: 'ClaudeApiError',
      code: 'API_ERROR',
      retryable: true,
    });
  });

  it('CA-07: SDK 400 throws API_ERROR non-retryable', async () => {
    createMessageMock.mockRejectedValue({ status: 400, message: 'bad request' });

    await expect(generateScope('sys', 'usr')).rejects.toMatchObject({
      name: 'ClaudeApiError',
      code: 'API_ERROR',
      retryable: false,
    });
  });
});

describe('generateScopeSection()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CA-08: valid section JSON with correct key returns section data object', async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ in_scope: ['Task 1', 'Task 2'] }) }],
    });

    const result = await generateScopeSection('sys', 'usr', 'in_scope');

    expect(result).toEqual({ in_scope: ['Task 1', 'Task 2'] });
  });

  it('CA-09: missing requested section key throws PARSE_FAILURE', async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ out_of_scope: ['Not requested'] }) }],
    });

    await expect(generateScopeSection('sys', 'usr', 'in_scope')).rejects.toMatchObject({
      name: 'ClaudeApiError',
      code: 'PARSE_FAILURE',
      retryable: false,
    });
  });
});

describe('ClaudeApiError', () => {
  it('constructs with code and retryable', () => {
    const err = new ClaudeApiError('msg', 'API_ERROR', true, 'raw');
    expect(err.code).toBe('API_ERROR');
    expect(err.retryable).toBe(true);
    expect(err.rawResponse).toBe('raw');
  });
});
