import crypto from 'node:crypto';

const FIRST_NAMES = ['John', 'Michael', 'David', 'Daniel', 'James', 'Alex', 'Samuel', 'Peter', 'Joseph', 'Brian', 'Grace', 'Mary', 'Esther', 'Ruth', 'Anna', 'Joy', 'Alice', 'Sarah', 'Diana', 'Lydia'];
const LAST_NAMES = ['Banda', 'Phiri', 'Zulu', 'Mwansa', 'Tembo', 'Okoro', 'Adebayo', 'Diallo', 'Camara', 'Toure', 'Kimani', 'Ndlovu', 'Moyo', 'Ibrahim', 'Khan', 'Aliyev', 'Sadykova', 'Bekov', 'Mendes', 'Costa'];

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

export function randomPersonName() {
  return {
    firstName: FIRST_NAMES[randomIndex(FIRST_NAMES.length)],
    lastName: LAST_NAMES[randomIndex(LAST_NAMES.length)],
  };
}

export function randomPhone(geoKey: string) {
  const prefixes: Record<string, string> = {
    zambia: '+26097',
    uganda: '+2567',
    nigeria: '+23480',
    guinea: '+22462',
    uzbekistan: '+9989',
    kazakhstan: '+770',
    generic_intl: '+447',
  };

  const prefix = prefixes[geoKey] ?? '+999';
  const digitsNeeded = Math.max(6, 12 - prefix.replace(/\D/g, '').length);
  return `${prefix}${randomDigits(digitsNeeded)}`;
}

function randomIndex(length: number) {
  return crypto.randomInt(0, length);
}
