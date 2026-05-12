import crypto from 'node:crypto';

// AES-256-GCM envelope encryption for short secrets stored in DB columns.
// Used for User.mfa_secret today; can be reused for any other small string
// that should not be readable from a DB dump.
//
// Format on disk: JSON envelope `{ v: 1, iv, ct, tag }` (all base64). Legacy
// rows stored plaintext base32 stay readable — decryptSecret returns them
// as-is so existing MFA setups keep working until the user next does a
// touchpoint that re-saves the secret.
//
// Key: 32 bytes, supplied via MFA_ENCRYPTION_KEY env var. Accept either
// 64-char hex or 44-char base64. Generate with:
//   openssl rand -base64 32

const ALG = 'aes-256-gcm';
const IV_LEN = 12;

function loadKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[startup] MFA_ENCRYPTION_KEY is required in production. ' +
        'Generate one with `openssl rand -base64 32`.',
      );
    }
    // Dev fallback: a fixed key derived from a placeholder so dev DBs
    // round-trip across restarts. Never reached in prod (throw above).
    return crypto.createHash('sha256').update('dev_mfa_encryption_key').digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must decode to exactly 32 bytes (64-char hex or base64-encoded 32-byte key).',
    );
  }
  return buf;
}

const KEY = loadKey();

interface Envelope {
  v: 1;
  iv: string;
  ct: string;
  tag: string;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: Envelope = {
    v: 1,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypt a stored secret. If the stored value isn't a recognised envelope
 * (legacy plaintext base32, etc.) returns it as-is so older rows keep working.
 */
export function decryptSecret(stored: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return stored; // legacy plaintext
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as Envelope).v !== 1 ||
    typeof (parsed as Envelope).iv !== 'string' ||
    typeof (parsed as Envelope).ct !== 'string' ||
    typeof (parsed as Envelope).tag !== 'string'
  ) {
    return stored;
  }
  const env = parsed as Envelope;
  const iv = Buffer.from(env.iv, 'base64');
  const ct = Buffer.from(env.ct, 'base64');
  const tag = Buffer.from(env.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALG, KEY, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}
