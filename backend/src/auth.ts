import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const PASSWORD_PREFIX = 'scrypt:v1';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return `${PASSWORD_PREFIX}:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash?: string | null, legacyPassword?: string | null) {
  if (passwordHash?.startsWith(`${PASSWORD_PREFIX}:`)) {
    const [, , salt, stored] = passwordHash.split(':');
    if (!salt || !stored) return false;
    const computed = scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(stored, 'base64url');
    return storedBuffer.length === computed.length && timingSafeEqual(storedBuffer, computed);
  }

  return Boolean(legacyPassword) && password === legacyPassword;
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
