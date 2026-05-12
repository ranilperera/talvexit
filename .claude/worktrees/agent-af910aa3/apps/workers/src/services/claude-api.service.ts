import Anthropic from '@anthropic-ai/sdk';
import { scopeSchema } from '@onys/shared';

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
