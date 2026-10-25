/**
 * Field-level encryption for PHI at rest.
 *
 * The embedded SQLite file lives on the practice's local machine. To protect
 * PHI even if the file is copied off the box, PHI-bearing fields are encrypted
 * at the application layer with AES-256-GCM before they are written, and
 * decrypted on read. The key is derived from the operator-supplied encryption
 * key via scrypt.
 *
 * This is deliberately a single choke point: callers never touch raw cipher
 * primitives. See db/index.ts for how encrypted columns are used.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard nonce length
const SALT = 'medauth-phi-at-rest-v1'; // static app salt for key derivation
const KEY_LENGTH = 32;

let derivedKeyCache: { source: string; key: Buffer } | null = null;

const deriveKey = (source: string): Buffer => {
  if (derivedKeyCache && derivedKeyCache.source === source) {
    return derivedKeyCache.key;
  }
  const key = crypto.scryptSync(source, SALT, KEY_LENGTH);
  derivedKeyCache = { source, key };
  return key;
};

/** Encrypt a UTF-8 string, returning a self-describing token. */
export const encryptField = (plaintext: string, keySource: string): string => {
  const key = deriveKey(keySource);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // token format: enc:v1:<iv>:<authTag>:<ciphertext>  (all base64)
  return [
    'enc',
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

/** Decrypt a token produced by encryptField. Passes plaintext through if not encrypted. */
export const decryptField = (token: string, keySource: string): string => {
  if (!token || !token.startsWith('enc:v1:')) {
    // Tolerate legacy/plaintext values so migrations are non-destructive.
    return token;
  }
  const parts = token.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted field token');
  }
  const [, , ivB64, tagB64, dataB64] = parts;
  const key = deriveKey(keySource);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};

/** True if a stored value is in encrypted-token form. */
export const isEncrypted = (value: string): boolean =>
  typeof value === 'string' && value.startsWith('enc:v1:');
