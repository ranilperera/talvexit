import type { ServerResponse } from 'node:http';

// ─── SseEvent ─────────────────────────────────────────────────────────────────

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

// ─── SseManager ───────────────────────────────────────────────────────────────
// In-process singleton that maps userId → active SSE response.
// One connection per user; a new connection replaces any existing one.
//
// To register a client:
//   res.writeHead(200, { 'Content-Type': 'text/event-stream', ... })
//   sseManager.register(userId, res)
//
// To push an event:
//   sseManager.push(userId, { type: 'chat_message', ... })

class SseManager {
  private readonly connections = new Map<string, ServerResponse>();

  /**
   * Register an active SSE connection for a user.
   * Replaces any previous connection for the same userId.
   * Automatically cleans up when the connection closes.
   *
   * @param userId - The authenticated user's ID.
   * @param res - The raw Node.js ServerResponse kept open for streaming.
   */
  register(userId: string, res: ServerResponse): void {
    // Close any existing connection for this user (e.g. duplicate tab)
    const existing = this.connections.get(userId);
    if (existing && !existing.writableEnded) {
      existing.end();
    }

    this.connections.set(userId, res);

    // Auto-cleanup when the client disconnects
    res.on('close', () => {
      if (this.connections.get(userId) === res) {
        this.connections.delete(userId);
      }
    });
  }

  /**
   * Push a JSON-encoded SSE event to a connected user.
   *
   * @param userId - Target user.
   * @param event - Payload; will be serialised as `data: <json>\n\n`.
   * @returns `true` if the message was written; `false` if the user is not connected.
   */
  push(userId: string, event: SseEvent): boolean {
    const res = this.connections.get(userId);
    if (!res || res.writableEnded) {
      this.connections.delete(userId);
      return false;
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  }

  /**
   * Returns whether the user currently has an active SSE connection.
   *
   * @param userId - The user to check.
   */
  isConnected(userId: string): boolean {
    const res = this.connections.get(userId);
    return !!res && !res.writableEnded;
  }

  /**
   * Close and remove a user's SSE connection.
   *
   * @param userId - The user to disconnect.
   */
  disconnect(userId: string): void {
    const res = this.connections.get(userId);
    if (res && !res.writableEnded) {
      res.end();
    }
    this.connections.delete(userId);
  }

  /** Current number of active connections (useful for health checks). */
  get connectionCount(): number {
    return this.connections.size;
  }
}

export const sseManager = new SseManager();
