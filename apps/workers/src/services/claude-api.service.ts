import Anthropic from '@anthropic-ai/sdk';
import { scopeSchema } from '@onys/shared';

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Mock scope (MOCK_AI=true) ────────────────────────────────────────────────

const MOCK_SCOPE = {
  title: 'Custom Software Development Project',
  domain: 'SOFTWARE_DEVELOPMENT',
  objective:
    'Design, develop and deliver a production-ready web application that meets the customer requirements, including automated testing, documentation and deployment to a cloud environment.',
  in_scope: [
    'Requirements analysis and technical specification',
    'Frontend and backend development using agreed technology stack',
    'Unit and integration test suite covering core business logic',
    'CI/CD pipeline setup and deployment to production environment',
    'Technical documentation and handover session',
  ],
  out_of_scope: [
    'Ongoing maintenance beyond the 30-day warranty period',
    'Third-party SaaS licence costs',
    'Infrastructure cost beyond initial setup',
  ],
  assumptions: [
    'Customer provides timely feedback within 2 business days',
    'Access to staging environment will be provisioned before kick-off',
    'Scope changes will be handled via a change-request process',
  ],
  prerequisites: [
    'Signed contract and initial deposit received',
    'Design assets or brand guidelines supplied by customer',
  ],
  deliverables: [
    'Deployed and functional application accessible via provided URL',
    'Source code repository with README and setup instructions',
    'Test suite with minimum 80% coverage on core modules',
    'Deployment runbook and architecture diagram',
  ],
  currency: 'AUD',
  price: 4500,
  hours_min: 32,
  hours_max: 48,
  milestone_count: 1,
};

// ─── Retry delays ─────────────────────────────────────────────────────────────

export const RETRY_DELAYS_MS = [30_000, 120_000, 480_000]; // 30s, 2m, 8m

// ─── ClaudeApiError ───────────────────────────────────────────────────────────

export class ClaudeApiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'RATE_LIMITED'
      | 'PARSE_FAILURE'
      | 'API_ERROR'
      | 'VALIDATION_FAILURE',
    public readonly retryable: boolean,
    public readonly rawResponse?: string,
  ) {
    super(message);
    this.name = 'ClaudeApiError';
  }
}

// ─── generateScope ────────────────────────────────────────────────────────────

export async function generateScope(
  system: string,
  user: string,
): Promise<{ parsed: Record<string, unknown>; rawText: string }> {
  if (process.env.MOCK_AI === 'true') {
    console.log('[claude-api] MOCK_AI=true — returning canned scope');
    return { parsed: MOCK_SCOPE as Record<string, unknown>, rawText: JSON.stringify(MOCK_SCOPE) };
  }

  let response: Awaited<ReturnType<typeof client.messages.create>>;

  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 429) {
      throw new ClaudeApiError('Claude API rate limit exceeded', 'RATE_LIMITED', true);
    }
    throw new ClaudeApiError(
      `Claude API error: ${e.message ?? 'unknown'}`,
      'API_ERROR',
      (e.status ?? 0) >= 500,
    );
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ClaudeApiError('Claude returned no text content', 'PARSE_FAILURE', false);
  }

  const rawText = textBlock.text.trim();

  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new ClaudeApiError(
      'Claude response was not valid JSON',
      'PARSE_FAILURE',
      false,
      rawText,
    );
  }

  const validation = scopeSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ClaudeApiError(
      `Scope validation failed: ${issues}`,
      'VALIDATION_FAILURE',
      false,
      rawText,
    );
  }

  return { parsed: validation.data as Record<string, unknown>, rawText };
}

// ─── generateScopeSection ─────────────────────────────────────────────────────

export async function generateScopeSection(
  system: string,
  user: string,
  section: string,
): Promise<Record<string, unknown>> {
  if (process.env.MOCK_AI === 'true') {
    console.log(`[claude-api] MOCK_AI=true — returning canned section "${section}"`);
    const value = (MOCK_SCOPE as Record<string, unknown>)[section] ?? [`Mock ${section} item`];
    return { [section]: value };
  }

  let response: Awaited<ReturnType<typeof client.messages.create>>;

  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 429) {
      throw new ClaudeApiError('Claude API rate limit exceeded', 'RATE_LIMITED', true);
    }
    throw new ClaudeApiError(
      `Claude API error: ${e.message ?? 'unknown'}`,
      'API_ERROR',
      (e.status ?? 0) >= 500,
    );
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ClaudeApiError('No text content', 'PARSE_FAILURE', false);
  }

  const cleaned = textBlock.text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const sectionData = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof sectionData !== 'object' || sectionData[section] === undefined) {
      throw new Error(`Response missing "${section}" key`);
    }
    return sectionData;
  } catch (err) {
    throw new ClaudeApiError(
      `Section parse failed: ${(err as Error).message}`,
      'PARSE_FAILURE',
      false,
      textBlock.text,
    );
  }
}
