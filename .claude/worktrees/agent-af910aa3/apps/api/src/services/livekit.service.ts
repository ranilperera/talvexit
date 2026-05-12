import {
  RoomServiceClient,
  EgressClient,
  AccessToken,
  EncodedFileOutput,
  AzureBlobUpload,
} from 'livekit-server-sdk';

// ─── LiveKitService ───────────────────────────────────────────────────────────

export class LiveKitService {
  private readonly roomService: RoomServiceClient;
  private readonly egressClient: EgressClient;

  constructor() {
    const httpUrl = (process.env.LIVEKIT_URL ?? 'http://localhost:7880')
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');
    const apiKey = process.env.LIVEKIT_API_KEY ?? '';
    const apiSecret = process.env.LIVEKIT_API_SECRET ?? '';

    this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    this.egressClient = new EgressClient(httpUrl, apiKey, apiSecret);
  }

  // ─── createRoom ────────────────────────────────────────────────────────────

  async createRoom(roomName: string): Promise<void> {
    await this.roomService.createRoom({
      name: roomName,
      emptyTimeout: 300,
      maxParticipants: 5,
      metadata: JSON.stringify({ platform: 'onys', created_at: new Date().toISOString() }),
    });
  }

  // ─── generateToken ─────────────────────────────────────────────────────────

  async generateToken(params: {
    roomName: string;
    userId: string;
    userName: string;
    role: 'host' | 'participant';
  }): Promise<string> {
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY ?? '',
      process.env.LIVEKIT_API_SECRET ?? '',
      {
        identity: params.userId,
        name: params.userName,
        ttl: 7200,
        metadata: JSON.stringify({ user_id: params.userId, role: params.role }),
      },
    );

    at.addGrant({
      roomJoin: true,
      room: params.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: params.role === 'host',
      roomRecord: params.role === 'host',
    });

    return at.toJwt();
  }

  // ─── startEgressRecording ──────────────────────────────────────────────────

  async startEgressRecording(params: {
    roomName: string;
    sessionId: string;
    sessionType: string;
  }): Promise<string> {
    const outputPath = `recordings/${params.sessionType.toLowerCase()}/${params.sessionId}/${params.sessionId}.mp4`;

    const fileOutput = new EncodedFileOutput({
      filepath: outputPath,
      disableManifest: false,
      output: {
        case: 'azure',
        value: new AzureBlobUpload({
          accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME ?? '',
          accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY ?? '',
          containerName: process.env.AZURE_BLOB_RECORDINGS_CONTAINER ?? 'recordings',
        }),
      },
    });

    const egressInfo = await this.egressClient.startRoomCompositeEgress(
      params.roomName,
      fileOutput,
    );

    return egressInfo.egressId;
  }

  // ─── stopEgress ────────────────────────────────────────────────────────────

  async stopEgress(egressId: string): Promise<void> {
    await this.egressClient.stopEgress(egressId);
  }

  // ─── deleteRoom ────────────────────────────────────────────────────────────

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.roomService.deleteRoom(roomName);
    } catch (e) {
      console.warn('deleteRoom failed silently:', e);
    }
  }

  // ─── getRoomInfo ───────────────────────────────────────────────────────────

  async getRoomInfo(roomName: string): Promise<{ numParticipants: number; exists: boolean }> {
    try {
      const rooms = await this.roomService.listRooms([roomName]);
      if (rooms.length === 0) return { numParticipants: 0, exists: false };
      return { numParticipants: rooms[0].numParticipants, exists: true };
    } catch {
      return { numParticipants: 0, exists: false };
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

export const livekitService = new LiveKitService();
