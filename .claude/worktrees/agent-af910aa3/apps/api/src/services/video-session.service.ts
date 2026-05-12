import type { ContractorProfile, PrismaClient, VideoSession } from '@prisma/client';
import type { Queue } from 'bullmq';
import { livekitService } from './livekit.service.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

type EmailJobPayload =
  | { type: 'kyc-session-scheduled'; to: string; scheduledAt: string; roomName: string }
  | { type: 'kyc-approved'; to: string }
  | { type: 'kyc-rejected'; to: string; notes?: string }
  | { type: 'kyc-session-cancelled'; to: string; reason?: string };

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

    await livekitService.createRoom(roomName);

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
  ): Promise<{
    token: string;
    room_name: string;
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

    const isHost = session.host_user_id === userId;
    const isParticipant = session.participant_user_id === userId;
    if (!isHost && !isParticipant) throw new AppError('FORBIDDEN', 403);

    if (session.status !== 'SCHEDULED' && session.status !== 'ACTIVE') {
      throw new AppError('SESSION_NOT_JOINABLE', 422, `Session status is ${session.status}`);
    }

    const role = isHost ? 'host' : 'participant';
    const userRecord = isHost ? session.host_user : session.participant_user;
    const otherUser = isHost ? session.participant_user : session.host_user;

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

    return {
      token,
      room_name: session.room_name,
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

    const egressId = await livekitService.startEgressRecording({
      roomName: session.room_name,
      sessionId: session.id,
      sessionType: session.session_type,
    });

    const updated = await this.prisma.videoSession.update({
      where: { id: sessionId },
      data: {
        status: 'RECORDING',
        egress_id: egressId,
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
      await livekitService.stopEgress(session.egress_id);

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
    if (session.host_user_id !== params.adminUserId) throw new AppError('FORBIDDEN', 403);

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
}
