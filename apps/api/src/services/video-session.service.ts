import type { ContractorProfile, PrismaClient, VideoSession } from '@prisma/client';
import type { Queue } from 'bullmq';
import { livekitService } from './livekit.service.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

type EmailJobPayload =
  | { type: 'kyc-session-scheduled'; to: string; scheduledAt: string; roomName: string }
  | { type: 'kyc-session-rescheduled'; to: string; scheduledAt: string; roomName: string }
  | { type: 'kyc-approved'; to: string }
  | { type: 'kyc-rejected'; to: string; notes?: string }
  | { type: 'kyc-session-cancelled'; to: string; reason?: string }
  | {
      type: 'kyc-reschedule-requested';
      to: string;
      contractor_name: string;
      contractor_email: string;
      original_at: string;
      proposed_at: string;
      comment: string | null;
      review_url: string;
    }
  | {
      type: 'kyc-reschedule-decision';
      to: string;
      decision: 'APPROVED' | 'REJECTED';
      proposed_at: string;
      effective_at: string | null;
      admin_notes: string | null;
      kyc_url: string;
    };

// ─── VideoSessionService ──────────────────────────────────────────────────────

export class VideoSessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── scheduleKycSession ──────────────────────────────────────────────────────

  async scheduleKycSession(params: {
    adminUserId: string;
    contractorUserId: string;
    scheduledAt: Date;
  }): Promise<VideoSession> {
    // Find contractor profile
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { user_id: params.contractorUserId },
    });
    if (!profile) throw new AppError('CONTRACTOR_NOT_FOUND', 404);
    if (profile.status !== 'PENDING') {
      throw new AppError('INVALID_STATE', 422, 'Contractor must be in PENDING status for KYC');
    }

    // Check no active VIDEO_KYC session exists
    const existing = await this.prisma.videoSession.findFirst({
      where: {
        participant_user_id: params.contractorUserId,
        session_type: 'VIDEO_KYC',
        status: { in: ['SCHEDULED', 'ACTIVE'] },
      },
    });
    if (existing) {
      throw new AppError('SESSION_ALREADY_EXISTS', 409, 'An active KYC session already exists for this contractor');
    }

    // Get contractor user for email
    const contractorUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: params.contractorUserId },
      select: { email: true, full_name: true },
    });

    const roomName = `onys-kyc-${profile.id}-${Date.now()}`;

    // createRoom is best-effort — LiveKit may not be running in dev
    await livekitService.createRoom(roomName).catch((err: unknown) => {
      console.warn('[livekit] createRoom failed (non-fatal):', (err as Error).message);
    });

    const session = await this.prisma.videoSession.create({
      data: {
        session_type: 'VIDEO_KYC',
        room_name: roomName,
        host_user_id: params.adminUserId,
        participant_user_id: params.contractorUserId,
        contractor_profile_id: profile.id,
        scheduled_at: params.scheduledAt,
        status: 'SCHEDULED',
        livekit_room_name: roomName,
      },
    });

    await this.emailQueue.add('kyc-session-scheduled', {
      type: 'kyc-session-scheduled',
      to: contractorUser.email,
      scheduledAt: params.scheduledAt.toISOString(),
      roomName,
    });

    // Mark contractor profile as KYC scheduled
    await this.prisma.contractorProfile.update({
      where: { id: profile.id },
      data: { kyc_status: 'SCHEDULED' },
    });

    await writeAudit(this.prisma, {
      actorId: params.adminUserId,
      actionType: 'KYC_SESSION_SCHEDULED',
      entityType: 'VideoSession',
      entityId: session.id,
      metadata: {
        contractor_user_id: params.contractorUserId,
        scheduled_at: params.scheduledAt.toISOString(),
      },
    });

    return session;
  }

  // ─── joinSession ─────────────────────────────────────────────────────────────

  async joinSession(
    sessionId: string,
    userId: string,
    accountType: string,
  ): Promise<{
    token: string;
    room_name: string;
    livekit_url: string;
    session: VideoSession;
    other_participant: { id: string; full_name: string; account_type: string };
  }> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
      include: {
        host_user: { select: { id: true, full_name: true, account_type: true } },
        participant_user: { select: { id: true, full_name: true, account_type: true } },
      },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);

    const ADMIN_TYPES = ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'];
    const isAdmin = ADMIN_TYPES.includes(accountType);
    const isHost = session.host_user_id === userId;
    const isParticipant = session.participant_user_id === userId;
    if (!isHost && !isParticipant && !isAdmin) throw new AppError('FORBIDDEN', 403);

    if (session.status !== 'SCHEDULED' && session.status !== 'ACTIVE') {
      throw new AppError('SESSION_NOT_JOINABLE', 422, `Session status is ${session.status}`);
    }

    const role = (isHost || isAdmin) ? 'host' : 'participant';
    const userRecord = isParticipant && !isAdmin ? session.participant_user : session.host_user;
    const otherUser = isParticipant && !isAdmin ? session.host_user : session.participant_user;

    const token = await livekitService.generateToken({
      roomName: session.room_name,
      userId,
      userName: userRecord.full_name,
      role,
    });

    // Transition SCHEDULED → ACTIVE on first join
    let updatedSession = session as unknown as VideoSession;
    if (session.status === 'SCHEDULED') {
      updatedSession = await this.prisma.videoSession.update({
        where: { id: sessionId },
        data: {
          status: 'ACTIVE',
          started_at: new Date(),
        },
      });
    }

    // LIVEKIT_PUBLIC_URL — the WSS URL the *browser* connects to (through HAProxy/CDN).
    // Falls back to LIVEKIT_URL for simple setups where the API and browser
    // use the same server (e.g. direct-access dev or no TLS termination proxy).
    const livekitUrl =
      process.env.LIVEKIT_PUBLIC_URL ??
      process.env.LIVEKIT_URL ??
      'ws://localhost:7880';

    return {
      token,
      room_name: session.room_name,
      livekit_url: livekitUrl,
      session: updatedSession,
      other_participant: otherUser,
    };
  }

  // ─── confirmConsent ──────────────────────────────────────────────────────────

  async confirmConsent(
    sessionId: string,
    userId: string,
  ): Promise<{ session: VideoSession; both_consented: boolean }> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);

    const isHost = session.host_user_id === userId;
    const isParticipant = session.participant_user_id === userId;
    if (!isHost && !isParticipant) throw new AppError('FORBIDDEN', 403);

    if (session.status !== 'ACTIVE') {
      throw new AppError('SESSION_NOT_ACTIVE', 422, 'Session must be ACTIVE to confirm consent');
    }

    const now = new Date();
    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: {
        ...(isHost && session.host_consent_at === null && { host_consent_at: now }),
        ...(isParticipant && session.participant_consent_at === null && { participant_consent_at: now }),
      },
    });

    const both_consented = updated.host_consent_at !== null && updated.participant_consent_at !== null;

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'SESSION_CONSENT_CONFIRMED',
      entityType: 'VideoSession',
      entityId: sessionId,
      metadata: { role: isHost ? 'host' : 'participant', both_consented },
    });

    return { session: updated, both_consented };
  }

  // ─── startRecording ──────────────────────────────────────────────────────────

  async startRecording(sessionId: string, adminUserId: string): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);

    if (session.host_user_id !== adminUserId) throw new AppError('FORBIDDEN', 403);
    if (session.status !== 'ACTIVE') {
      throw new AppError('SESSION_NOT_ACTIVE', 422, 'Session must be ACTIVE to start recording');
    }
    if (!session.host_consent_at || !session.participant_consent_at) {
      throw new AppError('CONSENT_REQUIRED', 422, 'Both parties must confirm consent before recording can start');
    }

    let egressId: string | null = null;
    try {
      egressId = await livekitService.startEgressRecording({
        roomName: session.room_name,
        sessionId: session.id,
        sessionType: session.session_type,
      });
    } catch (err) {
      console.warn('[livekit] startEgressRecording failed (non-fatal):', (err as Error).message);
    }

    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: {
        status: 'RECORDING',
        ...(egressId !== null && { egress_id: egressId }),
        recording_started_at: new Date(),
      },
    });

    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'SESSION_RECORDING_STARTED',
      entityType: 'VideoSession',
      entityId: sessionId,
      metadata: { egress_id: egressId },
    });

    return updated;
  }

  // ─── endSession ──────────────────────────────────────────────────────────────

  async endSession(sessionId: string, userId: string): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);

    const isHost = session.host_user_id === userId;
    const isParticipant = session.participant_user_id === userId;
    if (!isHost && !isParticipant) throw new AppError('FORBIDDEN', 403);

    if (session.status !== 'ACTIVE' && session.status !== 'RECORDING') {
      throw new AppError('SESSION_NOT_ACTIVE', 422, `Cannot end session with status ${session.status}`);
    }

    const now = new Date();
    let recordingDurationS: number | undefined;
    let recordingBlobPath: string | undefined;

    if (session.status === 'RECORDING' && session.egress_id) {
      await livekitService.stopEgress(session.egress_id).catch((err: unknown) => {
        console.warn('[livekit] stopEgress failed (non-fatal):', (err as Error).message);
      });

      if (session.recording_started_at) {
        recordingDurationS = Math.floor((now.getTime() - session.recording_started_at.getTime()) / 1000);
      }

      // Blob path mirrors what startEgressRecording wrote to Azure
      recordingBlobPath = `recordings/${session.session_type.toLowerCase()}/${session.id}/${session.id}.mp4`;
    }

    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        ended_at: now,
        ...(recordingBlobPath !== undefined && { recording_blob_path: recordingBlobPath }),
        ...(recordingDurationS !== undefined && { recording_duration_s: recordingDurationS }),
      },
    });

    await livekitService.deleteRoom(session.room_name);

    // If this was a KYC session, mark profile as pending admin review
    if (session.session_type === 'VIDEO_KYC' && session.contractor_profile_id) {
      await this.prisma.contractorProfile.update({
        where: { id: session.contractor_profile_id },
        data: { kyc_status: 'COMPLETED_PENDING_REVIEW' },
      });
    }

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'SESSION_ENDED',
      entityType: 'VideoSession',
      entityId: sessionId,
      metadata: {
        ...(recordingDurationS !== undefined && { recording_duration_s: recordingDurationS }),
      },
    });

    return updated;
  }

  // ─── recordKycOutcome ────────────────────────────────────────────────────────

  async recordKycOutcome(params: {
    sessionId: string;
    adminUserId: string;
    outcome: 'APPROVED' | 'REJECTED' | 'INCONCLUSIVE';
    notes?: string;
  }): Promise<{ session: VideoSession; profile: ContractorProfile | null }> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: params.sessionId },
      include: {
        participant_user: { select: { email: true } },
      },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);
    if (session.session_type !== 'VIDEO_KYC') {
      throw new AppError('INVALID_SESSION_TYPE', 422, 'Only VIDEO_KYC sessions support KYC outcomes');
    }
    if (session.status !== 'COMPLETED') {
      throw new AppError('SESSION_NOT_COMPLETED', 422, 'Session must be COMPLETED to record outcome');
    }
    // Any admin can record the outcome (not just the scheduling admin)

    const updatedSession = await this.prisma.videoSession.update({
      where: { id: params.sessionId },
      data: {
        kyc_outcome: params.outcome,
        kyc_outcome_notes: params.notes ?? null,
        kyc_reviewed_by: params.adminUserId,
        kyc_reviewed_at: new Date(),
      },
    });

    let updatedProfile: ContractorProfile | null = null;

    if (params.outcome === 'APPROVED' && session.contractor_profile_id) {
      updatedProfile = await this.prisma.contractorProfile.update({
        where: { id: session.contractor_profile_id },
        data: {
          kyc_status: 'APPROVED',
          identity_status: 'APPROVED',
          status: 'ACTIVE',
        },
      });

      await this.emailQueue.add('kyc-approved', {
        type: 'kyc-approved',
        to: session.participant_user.email,
      });

      await writeAudit(this.prisma, {
        actorId: params.adminUserId,
        actionType: 'KYC_APPROVED',
        entityType: 'VideoSession',
        entityId: params.sessionId,
        metadata: { contractor_profile_id: session.contractor_profile_id },
      });
    } else if (params.outcome === 'REJECTED' && session.contractor_profile_id) {
      updatedProfile = await this.prisma.contractorProfile.update({
        where: { id: session.contractor_profile_id },
        data: { kyc_status: 'REJECTED' },
      });

      await this.emailQueue.add('kyc-rejected', {
        type: 'kyc-rejected',
        to: session.participant_user.email,
        ...(params.notes !== undefined && { notes: params.notes }),
      });

      await writeAudit(this.prisma, {
        actorId: params.adminUserId,
        actionType: 'KYC_REJECTED',
        entityType: 'VideoSession',
        entityId: params.sessionId,
        metadata: {
          contractor_profile_id: session.contractor_profile_id,
          ...(params.notes !== undefined && { notes: params.notes }),
        },
      });
    }

    return { session: updatedSession, profile: updatedProfile };
  }

  // ─── getSessionsForContractor ────────────────────────────────────────────────

  async getSessionsForContractor(contractorUserId: string): Promise<VideoSession[]> {
    return this.prisma.videoSession.findMany({
      where: { participant_user_id: contractorUserId },
      orderBy: { scheduled_at: 'desc' },
    });
  }

  // ─── cancelSession ───────────────────────────────────────────────────────────

  async cancelSession(
    sessionId: string,
    actorId: string,
    reason?: string,
  ): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
      include: {
        host_user: { select: { email: true } },
        participant_user: { select: { email: true } },
      },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);

    const isHost = session.host_user_id === actorId;
    const isParticipant = session.participant_user_id === actorId;
    if (!isHost && !isParticipant) throw new AppError('FORBIDDEN', 403);

    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      throw new AppError('SESSION_NOT_CANCELLABLE', 422, `Session is already ${session.status}`);
    }

    // Stop egress if recording
    if (session.status === 'RECORDING' && session.egress_id) {
      await livekitService.stopEgress(session.egress_id).catch(() => {});
    }

    await livekitService.deleteRoom(session.room_name);

    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        ended_at: new Date(),
        ...(reason !== undefined && { cancellation_reason: reason }),
      },
    });

    // Email the OTHER party
    const otherEmail = isHost ? session.participant_user.email : session.host_user.email;
    await this.emailQueue.add('kyc-session-cancelled', {
      type: 'kyc-session-cancelled',
      to: otherEmail,
      ...(reason !== undefined && { reason }),
    });

    await writeAudit(this.prisma, {
      actorId,
      actionType: 'SESSION_CANCELLED',
      entityType: 'VideoSession',
      entityId: sessionId,
      metadata: {
        ...(reason !== undefined && { reason }),
      },
    });

    return updated;
  }

  // ─── rescheduleSession (admin only) ──────────────────────────────────────────

  async rescheduleSession(
    sessionId: string,
    adminUserId: string,
    newScheduledAt: Date,
  ): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
      include: { participant_user: { select: { email: true } } },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);
    if (session.status !== 'SCHEDULED') {
      throw new AppError(
        'SESSION_NOT_RESCHEDULABLE',
        422,
        'Only SCHEDULED sessions can be rescheduled',
      );
    }

    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: { scheduled_at: newScheduledAt },
    });

    await this.emailQueue.add('kyc-session-rescheduled', {
      type: 'kyc-session-rescheduled',
      to: session.participant_user.email,
      scheduledAt: newScheduledAt.toISOString(),
      roomName: session.room_name,
    });

    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'KYC_SESSION_RESCHEDULED',
      entityType: 'VideoSession',
      entityId: sessionId,
      metadata: { new_scheduled_at: newScheduledAt.toISOString() },
    });

    return updated;
  }

  // ─── adminCancelSession ───────────────────────────────────────────────────────
  // Admin bypass — does not require host/participant check.

  async adminCancelSession(
    sessionId: string,
    adminUserId: string,
    reason?: string,
  ): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: sessionId },
      include: {
        participant_user: { select: { email: true } },
      },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);

    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      throw new AppError(
        'SESSION_NOT_CANCELLABLE',
        422,
        `Session is already ${session.status}`,
      );
    }

    if (session.status === 'RECORDING' && session.egress_id) {
      await livekitService.stopEgress(session.egress_id).catch(() => {});
    }

    await livekitService.deleteRoom(session.room_name).catch(() => {});

    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        ended_at: new Date(),
        ...(reason !== undefined && { cancellation_reason: reason }),
      },
    });

    await this.emailQueue.add('kyc-session-cancelled', {
      type: 'kyc-session-cancelled',
      to: session.participant_user.email,
      ...(reason !== undefined && { reason }),
    });

    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'SESSION_CANCELLED',
      entityType: 'VideoSession',
      entityId: sessionId,
      metadata: { by_admin: true, ...(reason !== undefined && { reason }) },
    });

    return updated;
  }

  // ─── requestReschedule (contractor proposes a new time) ─────────────────────
  // Contractor-initiated reschedule. Stores the proposal on the session and
  // emails every PLATFORM_ADMIN / COMPLIANCE_ADMIN. Admin then either approves
  // (which calls the existing rescheduleSession path) or rejects.
  // Constraints:
  //   - session must be SCHEDULED (not ACTIVE/RECORDING/COMPLETED/CANCELLED)
  //   - caller must be the participant (contractor) of the session
  //   - no existing PENDING_REVIEW request — they must wait for a decision
  //     or cancel the existing request first

  async requestReschedule(params: {
    sessionId: string;
    contractorUserId: string;
    proposedAt: Date;
    comment: string | null;
  }): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: params.sessionId },
      include: {
        participant_user: { select: { full_name: true, email: true } },
      },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);
    if (session.participant_user_id !== params.contractorUserId) {
      throw new AppError('FORBIDDEN', 403, 'Only the contractor can propose a reschedule.');
    }
    if (session.status !== 'SCHEDULED') {
      throw new AppError(
        'SESSION_NOT_RESCHEDULABLE',
        422,
        `Reschedule proposals are only accepted while the session is SCHEDULED (current: ${session.status}).`,
      );
    }
    if (session.reschedule_request_status === 'PENDING_REVIEW') {
      throw new AppError(
        'RESCHEDULE_ALREADY_PENDING',
        409,
        'You already have a reschedule request awaiting admin review.',
      );
    }
    if (params.proposedAt <= new Date()) {
      throw new AppError(
        'RESCHEDULE_IN_PAST',
        422,
        'Proposed time must be in the future.',
      );
    }

    const updated = await this.prisma.videoSession.update({
      where: { id: params.sessionId },
      data: {
        reschedule_request_status: 'PENDING_REVIEW',
        reschedule_proposed_at: params.proposedAt,
        reschedule_comment: params.comment,
        reschedule_requested_by_id: params.contractorUserId,
        reschedule_requested_at: new Date(),
        // Clear any prior decision metadata so the UI reads cleanly
        reschedule_decided_by_id: null,
        reschedule_decided_at: null,
        reschedule_admin_notes: null,
      },
    });

    // Email every active admin so the next person on shift can pick it up.
    const admins = await this.prisma.user.findMany({
      where: {
        account_type: { in: ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'] },
        banned_at: null,
        suspended_at: null,
      },
      select: { email: true },
    });

    const reviewUrl = `${process.env.FRONTEND_URL ?? ''}/admin/kyc`;
    for (const admin of admins) {
      await this.emailQueue.add('kyc-reschedule-requested', {
        type: 'kyc-reschedule-requested',
        to: admin.email,
        contractor_name: session.participant_user.full_name,
        contractor_email: session.participant_user.email,
        original_at: session.scheduled_at.toISOString(),
        proposed_at: params.proposedAt.toISOString(),
        comment: params.comment,
        review_url: reviewUrl,
      });
    }

    await writeAudit(this.prisma, {
      actorId: params.contractorUserId,
      actionType: 'KYC_RESCHEDULE_REQUESTED',
      entityType: 'VideoSession',
      entityId: params.sessionId,
      metadata: {
        original_at: session.scheduled_at.toISOString(),
        proposed_at: params.proposedAt.toISOString(),
        has_comment: params.comment !== null,
      },
    });

    return updated;
  }

  // ─── decideRescheduleRequest (admin approves or rejects) ───────────────────
  // Admin endpoint. On APPROVED, moves scheduled_at to reschedule_proposed_at
  // and queues the standard 'kyc-session-rescheduled' email (so the contractor
  // sees the new time framed as a confirmation). Either way, also queues
  // 'kyc-reschedule-decision' so the decision + admin notes reach them.

  async decideRescheduleRequest(params: {
    sessionId: string;
    adminUserId: string;
    decision: 'APPROVED' | 'REJECTED';
    adminNotes: string | null;
  }): Promise<VideoSession> {
    const session = await this.prisma.videoSession.findUnique({
      where: { id: params.sessionId },
      include: { participant_user: { select: { email: true } } },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404);
    if (session.reschedule_request_status !== 'PENDING_REVIEW') {
      throw new AppError(
        'NO_PENDING_RESCHEDULE',
        422,
        'There is no pending reschedule request to decide on.',
      );
    }
    if (!session.reschedule_proposed_at) {
      throw new AppError('INVALID_STATE', 500, 'Pending request has no proposed time.');
    }

    const proposedAt = session.reschedule_proposed_at;

    let updated: VideoSession;
    if (params.decision === 'APPROVED') {
      updated = await this.prisma.videoSession.update({
        where: { id: params.sessionId },
        data: {
          scheduled_at: proposedAt,
          reschedule_request_status: 'APPROVED',
          reschedule_decided_by_id: params.adminUserId,
          reschedule_decided_at: new Date(),
          reschedule_admin_notes: params.adminNotes,
        },
      });

      // Send the standard "rescheduled" email so the contractor's inbox
      // reads the same as an admin-initiated reschedule.
      await this.emailQueue.add('kyc-session-rescheduled', {
        type: 'kyc-session-rescheduled',
        to: session.participant_user.email,
        scheduledAt: proposedAt.toISOString(),
        roomName: session.room_name,
      });
    } else {
      updated = await this.prisma.videoSession.update({
        where: { id: params.sessionId },
        data: {
          reschedule_request_status: 'REJECTED',
          reschedule_decided_by_id: params.adminUserId,
          reschedule_decided_at: new Date(),
          reschedule_admin_notes: params.adminNotes,
        },
      });
    }

    // Always send the decision email — gives the contractor admin notes
    // even when approved, and an explicit "declined" message when rejected.
    const kycUrl = `${process.env.FRONTEND_URL ?? ''}/contractor/kyc`;
    await this.emailQueue.add('kyc-reschedule-decision', {
      type: 'kyc-reschedule-decision',
      to: session.participant_user.email,
      decision: params.decision,
      proposed_at: proposedAt.toISOString(),
      effective_at: params.decision === 'APPROVED' ? proposedAt.toISOString() : null,
      admin_notes: params.adminNotes,
      kyc_url: kycUrl,
    });

    await writeAudit(this.prisma, {
      actorId: params.adminUserId,
      actionType: params.decision === 'APPROVED'
        ? 'KYC_RESCHEDULE_APPROVED'
        : 'KYC_RESCHEDULE_REJECTED',
      entityType: 'VideoSession',
      entityId: params.sessionId,
      metadata: {
        proposed_at: proposedAt.toISOString(),
        ...(params.adminNotes !== null && { admin_notes: params.adminNotes }),
      },
    });

    return updated;
  }
}
