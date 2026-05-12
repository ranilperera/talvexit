import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import {
  generateScope,
  generateScopeSection,
  ClaudeApiError,
  RETRY_DELAYS_MS,
} from '../services/claude-api.service.js';
import { buildFullScopePrompt, buildSectionRegenPrompt } from '../utils/scoping-prompt.js';
import type { GenerateScopeInput } from '@onys/shared';

// ─── Job data types ───────────────────────────────────────────────────────────

type FullScopeJobData = {
  type: 'full';
  pendingScopeId: string;
};

type SectionJobData = {
  type: 'section';
  pendingScopeId: string;
  section: string;
  feedback?: string;
};

type AiScopingJobData = FullScopeJobData | SectionJobData;

// ─── Queue + connection ───────────────────────────────────────────────────────

const QUEUE_NAME = process.env.AI_SCOPING_QUEUE_NAME ?? 'ai-scoping';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

// Internal queue reference for re-queueing retries
const aiScopingQueue = new Queue<AiScopingJobData>(QUEUE_NAME, { connection });

// ─── processFullScope ─────────────────────────────────────────────────────────

async function processFullScope(pendingScopeId: string): Promise<void> {
  const record = await prisma.pendingScope.findUniqueOrThrow({
    where: { id: pendingScopeId },
  });

  await prisma.pendingScope.update({
    where: { id: pendingScopeId },
    data: { status: 'PROCESSING' },
  });

  try {
    const { system, user } = buildFullScopePrompt({
      requirement_text: record.requirement_text,
      context: record.context as GenerateScopeInput['context'],
      domain_hint: record.domain_hint as GenerateScopeInput['domain_hint'],
    });

    const { parsed, rawText } = await generateScope(system, user);

    await prisma.pendingScope.update({
      where: { id: pendingScopeId },
      data: {
        status: 'COMPLETE',
        ai_scope: parsed as never,
        ai_scope_raw: rawText,
      },
    });

    console.log(`[ai-scoping] full scope generated for ${pendingScopeId}`);
  } catch (err) {
    const attempts = record.attempts + 1;
    const isClaudeError = err instanceof ClaudeApiError;
    const retryable = isClaudeError && err.retryable;
    const delay = RETRY_DELAYS_MS[record.attempts]; // index = attempts before this run

    if (retryable && delay !== undefined) {
      await prisma.pendingScope.update({
        where: { id: pendingScopeId },
        data: {
          status: 'PENDING',
          attempts,
          last_error: (err as Error).message,
        },
      });
      await aiScopingQueue.add(
        'full',
        { type: 'full', pendingScopeId },
        { delay },
      );
      console.log(
        `[ai-scoping] retrying ${pendingScopeId} in ${delay}ms (attempt ${attempts})`,
      );
    } else {
      await prisma.pendingScope.update({
        where: { id: pendingScopeId },
        data: {
          status: 'FAILED',
          attempts,
          last_error: (err as Error).message,
        },
      });
      console.error(`[ai-scoping] permanently failed ${pendingScopeId}:`, err);
    }
  }
}

// ─── processSectionRegen ──────────────────────────────────────────────────────

async function processSectionRegen(
  pendingScopeId: string,
  section: string,
  feedback?: string,
): Promise<void> {
  const record = await prisma.pendingScope.findUniqueOrThrow({
    where: { id: pendingScopeId },
  });

  if (!record.ai_scope) {
    throw new Error('Cannot regenerate section: no existing scope');
  }

  const currentScope = record.ai_scope as Record<string, unknown>;

  try {
    const { system, user } = buildSectionRegenPrompt(section, currentScope, feedback);
    const sectionData = await generateScopeSection(system, user, section);

    const updatedScope = { ...currentScope, ...sectionData };
    const regenEntry = {
      section,
      feedback: feedback ?? null,
      timestamp: new Date().toISOString(),
    };

    await prisma.pendingScope.update({
      where: { id: pendingScopeId },
      data: {
        ai_scope: updatedScope as never,
        regen_log: [...(record.regen_log as unknown[]), regenEntry] as never,
      },
    });

    console.log(`[ai-scoping] section "${section}" regenerated for ${pendingScopeId}`);
  } catch (err) {
    console.error(`[ai-scoping] section regen failed for ${pendingScopeId}:`, err);
    throw err;
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const aiScopingWorker = new Worker<AiScopingJobData>(
  QUEUE_NAME,
  async (job) => {
    const { data } = job;
    if (data.type === 'full') {
      await processFullScope(data.pendingScopeId);
    } else {
      await processSectionRegen(data.pendingScopeId, data.section, data.feedback);
    }
  },
  { connection },
);

aiScopingWorker.on('failed', (job, err) => {
  console.error(`[ai-scoping] job ${job?.id} failed:`, err);
});

console.log(`[ai-scoping] worker started on queue "${QUEUE_NAME}"`);
