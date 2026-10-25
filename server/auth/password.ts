/**
 * Password hashing with scrypt (salted, constant-time verify).
 * No plaintext passwords are ever stored or logged.
 */

import crypto from 'node:crypto';

const KEYLEN = 64;

export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
};

/** Hash a bearer token for storage (never store the raw token). */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** Generate an opaque bearer token. */
export const newToken = (): string => crypto.randomBytes(32).toString('base64url');
