import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for OAuth tokens at rest.
 *
 * Format: base64( iv[12] || authTag[16] || ciphertext )
 *
 * The key lives in TOKEN_ENCRYPTION_KEY (base64, 32 bytes). This keeps a Google
 * CASA Tier 2 assessment viable later — "restricted scope tokens encrypted at
 * rest with a key outside the database" is one of its explicit expectations.
 */

const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}. Generate with: openssl rand -base64 32`,
    );
  }
  return buf;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptToken(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
