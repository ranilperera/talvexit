// Magic-byte verification for uploaded files. The Content-Type header alone
// can be spoofed, so before we hand a buffer off to blob storage we sniff the
// first few bytes and confirm they actually match the claimed MIME.
//
// Office docs (DOC, XLSX, etc.) intentionally aren't covered here — they share
// the ZIP magic with countless other formats and benign variants exist that
// don't sniff cleanly. Routes that accept Office files (e.g. tender proposals)
// should rely on the extension/MIME pair plus Content-Disposition: attachment
// on download instead.

interface Signature {
  mime: string;
  bytes: number[];          // expected leading bytes
  offset?: number;          // start position (default 0)
}

const SIGNATURES: Signature[] = [
  // %PDF-
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // JPEG: FF D8 FF
  { mime: 'image/jpeg',      bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png',       bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF: 'GIF87a' / 'GIF89a'
  { mime: 'image/gif',       bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: RIFF....WEBP (offset 8)
  { mime: 'image/webp',      bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
};

function bytesMatch(buf: Buffer, sig: Signature): boolean {
  const offset = sig.offset ?? 0;
  if (buf.length < offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buf[offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}

/**
 * Returns true when the buffer's leading bytes match the expected magic for
 * the claimed MIME. Returns true (allow-pass-through) for MIMEs not covered
 * here (e.g. Office formats), so callers should pre-restrict their MIME
 * allowlist before invoking this.
 */
export function verifyFileSignature(buf: Buffer, claimedMime: string): boolean {
  const mime = MIME_ALIASES[claimedMime] ?? claimedMime;
  const known = SIGNATURES.filter((s) => s.mime === mime);
  if (known.length === 0) return true; // not covered — defer to MIME allowlist
  return known.some((sig) => bytesMatch(buf, sig));
}
