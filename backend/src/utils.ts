import crypto from 'node:crypto';

export function randomString(length: number, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const bytes = crypto.randomBytes(length);
  return Array.from({ length }, (_, i) => alphabet[bytes[i] % alphabet.length]).join('');
}

export function randomDigits(length: number) {
  const bytes = crypto.randomBytes(length);
  return Array.from({ length }, (_, i) => String(bytes[i] % 10)).join('');
}

export function fillTemplate(template: string) {
  return template
    .replace('{YYYY}', String(new Date().getFullYear()))
    .replace(/\{RAND(\d+)\}/g, (_, digits) => randomDigits(Number(digits)));
}

export function extractLinks(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s]+/g)].map((m) => m[0]);
}

export function extractCodes(text: string) {
  return [...new Set([...text.matchAll(/\b\d{4,8}\b/g)].map((m) => m[0]))];
}
