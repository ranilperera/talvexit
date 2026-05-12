import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Queue } from 'bullmq';

type ContactJobPayload = {
  type: 'contact-enquiry';
  name: string;
  email: string;
  enquiry_type: string;
  message: string;
};

function handleError(reply: FastifyReply, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status ?? 500;
  const code = e.code ?? 'INTERNAL_ERROR';
  const message = e.message ?? 'An unexpected error occurred';
  return reply.status(status).send({ success: false, error: { code, message } });
}

const ALLOWED_ENQUIRY_TYPES = [
  'Enterprise / buyer enquiry',
  'Join as an engineer',
  'Register a company',
  'Partnership or integration',
  'Press or media',
  'Technical support',
  'Other',
];

export async function contactRoutes(
  app: FastifyInstance,
  opts: { emailQueue: Queue<ContactJobPayload> },
) {
  const { emailQueue } = opts;

  // ─── POST /contact ────────────────────────────────────────────────────────

  app.post('/contact', async (req, reply) => {
    const body = req.body as {
      name?: unknown;
      email?: unknown;
      enquiry_type?: unknown;
      message?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const enquiry_type = typeof body.enquiry_type === 'string' ? body.enquiry_type.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name || name.length < 2) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name must be at least 2 characters' },
      });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid email address is required' },
      });
    }
    if (!ALLOWED_ENQUIRY_TYPES.includes(enquiry_type)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid enquiry_type' },
      });
    }
    if (!message || message.length < 10) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'message must be at least 10 characters' },
      });
    }
    if (message.length > 5000) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'message must not exceed 5000 characters' },
      });
    }

    try {
      await emailQueue.add('contact-enquiry', {
        type: 'contact-enquiry',
        name,
        email,
        enquiry_type,
        message,
      });

      return reply.status(200).send({
        success: true,
        data: { message: 'Your enquiry has been received. We will be in touch shortly.' },
      });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
