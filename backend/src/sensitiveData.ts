import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const encryptedPrefix = 'enc:v1:';
const keyBytes = 32;
const ivBytes = 12;

export function assertDataEncryptionReady() {
  getDataEncryptionKey();
}

export function hasDataEncryptionKey() {
  return getDataEncryptionKey() !== null;
}

export function isEncryptedSensitive(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(encryptedPrefix);
}

export function encryptSensitive(value: string, context: string) {
  const key = getDataEncryptionKey();
  if (!key || isEncryptedSensitive(value)) return value;

  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'enc',
    'v1',
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function encryptSensitiveNullable(value: string | null | undefined, context: string) {
  if (value === null || value === undefined) return null;
  return encryptSensitive(value, context);
}

export function decryptSensitive(value: string, context: string) {
  if (!isEncryptedSensitive(value)) return value;

  const key = getDataEncryptionKey();
  if (!key) {
    throw new Error('DATA_ENCRYPTION_KEY is required to decrypt sensitive data');
  }

  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Unsupported sensitive data encryption format');
  }

  const [, , encodedIv, encodedTag, encodedCiphertext] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function decryptSensitiveNullable(value: string | null | undefined, context: string) {
  if (value === null || value === undefined) return null;
  return decryptSensitive(value, context);
}

function getDataEncryptionKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATA_ENCRYPTION_KEY is required in production');
    }
    return null;
  }

  const normalized = raw.startsWith('base64:') ? raw.slice('base64:'.length) : raw;
  const key = /^[a-f0-9]{64}$/i.test(normalized)
    ? Buffer.from(normalized, 'hex')
    : Buffer.from(normalized, 'base64');

  if (key.length !== keyBytes) {
    throw new Error('DATA_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}
