import type { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import type { NotificationService } from './notification.service.js';

// ─── Shared select shapes ─────────────────────────────────────────────────────

const senderSelect = {
  id: true,
  full_name: true,
  account_type: true,
} as const;

const messageSelect = {
  id: true,
  body: true,
  created_at: true,
  sender: { select: senderSelect },
} as const;

const threadSummarySelect = {
  id: true,
  type: true,
  subject: true,
  status: true,
  created_at: true,
  updated_at: true,
  customer: { select: senderSelect },
  task: { select: { id: true, title: true, domain: true } },
  messages: {
    orderBy: { created_at: 'desc' as const },
    take: 1,
    select: messageSelect,
  },
  _count: { select: { messages: true } },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

export class TaskThreadService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService?: NotificationService,
  ) {}

  // ─── createThread ──────────────────────────────────────────────────────────
  // Customer starts a new discussion thread on a published task.

  async createThread(
    taskId: string,
    customerId: string,
    type: 'QUESTION' | 'SCOPE_CHANGE',
    subject: string,
    firstMessage: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true },
    });
    if (!task) throw new AppError('TASK_NOT_FOUND', 404, 'Task not found.');
    if (task.status !== 'PUBLISHED') {
      throw new AppError('TASK_NOT_PUBLISHED', 400, 'Threads can only be started on published tasks.');
    }

    return this.prisma.taskThread.create({
      data: {
        task_id: taskId,
        customer_id: customerId,
        type,
        subject: subject.trim(),
        messages: {
          create: {
            sender_id: customerId,
            body: firstMessage.trim(),
          },
        },
      },
      select: {
        ...threadSummarySelect,
        messages: {
          orderBy: { created_at: 'asc' as const },
          select: messageSelect,
        },
      },
    });
  }

  // ─── getThreadsForTask ─────────────────────────────────────────────────────
  // Returns all threads for a task. Only callable by the task owner.

  async getThreadsForTask(taskId: string, requesterId: string) {
    // Verify requester owns the task (contractor or company member)
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        created_by_user_id: true,
        company_id: true,
        assigned_member_id: true,
      },
    });
    if (!task) throw new AppError('TASK_NOT_FOUND', 404, 'Task not found.');

    const isOwner = task.created_by_user_id === requesterId || task.assigned_member_id === requesterId;

    let isCompanyMember = false;
    if (!isOwner && task.company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: { company_id: task.company_id, user_id: requesterId },
        select: { id: true },
      });
      isCompanyMember = !!member;
    }

    if (!isOwner && !isCompanyMember) {
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this task\'s threads.');
    }

    return this.prisma.taskThread.findMany({
      where: { task_id: taskId },
      orderBy: { updated_at: 'desc' },
      select: threadSummarySelect,
    });
  }

  // ─── getMyThreads ──────────────────────────────────────────────────────────
  // Returns all threads started by the logged-in customer.

  async getMyThreads(customerId: string) {
    return this.prisma.taskThread.findMany({
      where: { customer_id: customerId },
      orderBy: { updated_at: 'desc' },
      select: threadSummarySelect,
    });
  }

  // ─── getThread ─────────────────────────────────────────────────────────────
  // Returns full thread with all messages. Accessible by customer or task owner.

  async getThread(threadId: string, requesterId: string) {
    const thread = await this.prisma.taskThread.findUnique({
      where: { id: threadId },
      select: {
        ...threadSummarySelect,
        messages: {
          orderBy: { created_at: 'asc' as const },
          select: messageSelect,
        },
        task: {
          select: {
            id: true,
            title: true,
            domain: true,
            created_by_user_id: true,
            company_id: true,
            assigned_member_id: true,
          },
        },
      },
    });
    if (!thread) throw new AppError('THREAD_NOT_FOUND', 404, 'Thread not found.');

    const isCustomer = thread.customer.id === requesterId;
    const isOwner =
      thread.task.created_by_user_id === requesterId ||
      thread.task.assigned_member_id === requesterId;

    let isCompanyMember = false;
    if (!isCustomer && !isOwner && thread.task.company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: { company_id: thread.task.company_id, user_id: requesterId },
        select: { id: true },
      });
      isCompanyMember = !!member;
    }

    if (!isCustomer && !isOwner && !isCompanyMember) {
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this thread.');
    }

    return thread;
  }

  // ─── sendMessage ───────────────────────────────────────────────────────────
  // Either party can send messages in an open thread.

  async sendMessage(threadId: string, senderId: string, body: string) {
    const thread = await this.prisma.taskThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        status: true,
        subject: true,
        customer_id: true,
        task: {
          select: {
            id: true,
            title: true,
            created_by_user_id: true,
            company_id: true,
            assigned_member_id: true,
          },
        },
      },
    });
    if (!thread) throw new AppError('THREAD_NOT_FOUND', 404, 'Thread not found.');
    if (thread.status === 'CLOSED') throw new AppError('THREAD_CLOSED', 400, 'This thread is closed.');

    const isCustomer = thread.customer_id === senderId;
    const isOwner =
      thread.task.created_by_user_id === senderId ||
      thread.task.assigned_member_id === senderId;

    let isCompanyMember = false;
    if (!isCustomer && !isOwner && thread.task.company_id) {
      const member = await this.prisma.companyMember.findFirst({
        where: { company_id: thread.task.company_id, user_id: senderId },
        select: { id: true },
      });
      isCompanyMember = !!member;
    }

    if (!isCustomer && !isOwner && !isCompanyMember) {
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this thread.');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.taskMessage.create({
        data: { thread_id: threadId, sender_id: senderId, body: body.trim() },
        select: { id: true, body: true, created_at: true, sender: { select: senderSelect } },
      }),
      this.prisma.taskThread.update({
        where: { id: threadId },
        data: { updated_at: new Date() },
      }),
    ]);

    // ─── Notify recipients ──────────────────────────────────────────────────
    // The recipient set depends on who sent the message.
    if (this.notificationService) {
      const recipientIds = new Set<string>();

      if (isCustomer) {
        // Customer sent → notify the task owner / assigned member / all company members
        if (thread.task.assigned_member_id) {
          recipientIds.add(thread.task.assigned_member_id);
        } else if (thread.task.company_id) {
          // No specific assignee — notify the company's primary admin (and any active members)
          const companyMembers = await this.prisma.companyMember.findMany({
            where: { company_id: thread.task.company_id, status: 'ACTIVE' },
            select: { user_id: true },
          });
          for (const m of companyMembers) recipientIds.add(m.user_id);
          const company = await this.prisma.consultingCompany.findUnique({
            where: { id: thread.task.company_id },
            select: { primary_admin_id: true },
          });
          if (company?.primary_admin_id) recipientIds.add(company.primary_admin_id);
        } else {
          // Individual contractor task
          recipientIds.add(thread.task.created_by_user_id);
        }
      } else {
        // Provider side sent → notify the customer
        recipientIds.add(thread.customer_id);
      }

      // Don't notify the sender themselves
      recipientIds.delete(senderId);

      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { full_name: true },
      });
      const senderName = sender?.full_name ?? 'A user';
      const preview = body.trim().slice(0, 80) + (body.trim().length > 80 ? '…' : '');
      const subject = thread.subject || thread.task.title || 'task';

      await Promise.all(
        Array.from(recipientIds).map((uid) =>
          this.notificationService!.notify({
            userId: uid,
            category: 'MESSAGE',
            title: `New message: ${subject}`,
            body: `${senderName}: ${preview}`,
            linkUrl: `/tasks/${thread.task.id}?thread=${threadId}`,
            metadata: { thread_id: threadId, task_id: thread.task.id, sender_id: senderId },
          }),
        ),
      );
    }

    return message;
  }
}
