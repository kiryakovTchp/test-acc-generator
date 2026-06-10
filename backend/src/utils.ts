import crypto from 'node:crypto';
import type { Gender, PersonaKey } from './types.js';

const MALE_FIRST_NAMES = ['John', 'Michael', 'David', 'Daniel', 'James', 'Alex', 'Samuel', 'Peter', 'Joseph', 'Brian'];
const FEMALE_FIRST_NAMES = ['Grace', 'Mary', 'Esther', 'Ruth', 'Anna', 'Joy', 'Alice', 'Sarah', 'Diana', 'Lydia'];
const LAST_NAMES = ['Banda', 'Phiri', 'Zulu', 'Mwansa', 'Tembo', 'Okoro', 'Adebayo', 'Diallo', 'Camara', 'Toure', 'Kimani', 'Ndlovu', 'Moyo', 'Ibrahim', 'Khan', 'Aliyev', 'Sadykova', 'Bekov', 'Mendes', 'Costa'];

interface GeoRegionProfile {
  name?: string;
  cities: string[];
  postalPrefixes: string[];
  streetPrefixes: string[];
}

interface GeoProfile {
  country: string;
  regions: GeoRegionProfile[];
}

const GEO_PROFILE_DEFAULTS: Record<string, GeoProfile> = {
  zambia: {
    country: 'Zambia',
    regions: [
      { name: 'Lusaka Province', cities: ['Lusaka', 'Kafue'], postalPrefixes: ['101', '102'], streetPrefixes: ['Kafue Road', 'Church Road'] },
      { name: 'Copperbelt Province', cities: ['Ndola', 'Kitwe'], postalPrefixes: ['103', '104'], streetPrefixes: ['Freedom Way', 'President Avenue'] },
    ],
  },
  uganda: {
    country: 'Uganda',
    regions: [
      { name: 'Central Region', cities: ['Kampala', 'Entebbe'], postalPrefixes: ['25', '26'], streetPrefixes: ['Jinja Road', 'Kira Road'] },
      { name: 'Eastern Region', cities: ['Jinja', 'Mbale'], postalPrefixes: ['27', '28'], streetPrefixes: ['Acacia Avenue', 'Republic Street'] },
    ],
  },
  nigeria: {
    country: 'Nigeria',
    regions: [
      { name: 'Lagos', cities: ['Lagos', 'Ikeja'], postalPrefixes: ['100', '101'], streetPrefixes: ['Allen Avenue', 'Broad Street'] },
      { name: 'Federal Capital Territory', cities: ['Abuja'], postalPrefixes: ['900'], streetPrefixes: ['Adetokunbo Ademola', 'Ahmadu Bello Way'] },
      { name: 'Rivers', cities: ['Port Harcourt'], postalPrefixes: ['500'], streetPrefixes: ['Aba Road', 'Peter Odili Road'] },
    ],
  },
  guinea: {
    country: 'Guinea',
    regions: [
      { name: 'Conakry Region', cities: ['Conakry'], postalPrefixes: ['001'], streetPrefixes: ['Rue KA', 'Avenue Republique'] },
      { name: 'Kankan Region', cities: ['Kankan', 'Kindia'], postalPrefixes: ['101', '201'], streetPrefixes: ['Rue Niger', 'Route Nationale'] },
    ],
  },
  uzbekistan: {
    country: 'Uzbekistan',
    regions: [
      { name: 'Tashkent Region', cities: ['Tashkent'], postalPrefixes: ['100'], streetPrefixes: ['Amir Temur', 'Mustaqillik'] },
      { name: 'Samarkand Region', cities: ['Samarkand', 'Bukhara'], postalPrefixes: ['140', '200'], streetPrefixes: ['Navoi Street', 'Registan Street'] },
    ],
  },
  kazakhstan: {
    country: 'Kazakhstan',
    regions: [
      { name: 'Almaty Region', cities: ['Almaty'], postalPrefixes: ['050'], streetPrefixes: ['Abay Avenue', 'Dostyk Street'] },
      { name: 'Akmola Region', cities: ['Astana'], postalPrefixes: ['010'], streetPrefixes: ['Tauelsizdik Avenue', 'Kabanbay Batyr Avenue'] },
      { name: 'Shymkent', cities: ['Shymkent'], postalPrefixes: ['160'], streetPrefixes: ['Tauke Khan', 'Baidibek Bi Avenue'] },
    ],
  },
  generic_intl: {
    country: 'United Kingdom',
    regions: [
      { name: 'Not specified', cities: ['London', 'Manchester', 'Birmingham'], postalPrefixes: ['SW1', 'M1', 'B1'], streetPrefixes: ['King Street', 'Victoria Road', 'High Street'] },
    ],
  },
};

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
  return [...text.matchAll(/https?:\/\/[^\s)\]"'>]+/g)].map((m) => m[0]);
}

export function cleanEmailText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/https?:\/\/[^\s)\]>]+/g, ' ')
    .replace(/[([]\s*[)\]]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ?([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function dedupeLinks<T extends { url: string }>(links: T[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const normalized = normalizeUrl(link.url);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    link.url = normalized;
    return true;
  });
}

export function pickPrimaryVerificationLink(links: Array<{ url: string; label?: string }>) {
  return [...links]
    .sort((a, b) => scoreVerificationLink(b) - scoreVerificationLink(a))[0] ?? null;
}

function scoreVerificationLink(link: { url: string; label?: string }) {
  const combined = `${link.label ?? ''} ${link.url}`.toLowerCase();
  let score = 0;

  if (/verify|verification|confirm|activation|activate|complete registration|finish sign\s?up|validate email/.test(combined)) score += 70;
  if (/otp|one[- ]time|security code|passcode|login/.test(combined)) score += 10;
  if (/unsubscribe|preferences|privacy|support|help|view in browser/.test(combined)) score -= 80;

  try {
    const parsed = new URL(link.url);
    const host = parsed.hostname.toLowerCase();
    const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();

    if (/verify|confirm|activate|complete|registration/.test(pathAndQuery)) score += 45;
    if (/token=|code=|otp=|confirmation/.test(pathAndQuery)) score += 15;
    if (/click|track|trk|lnk|mailchi\.mp|mandrillapp|sendgrid|sparkpost|mailgun/.test(host)) score -= 35;
    if (/(^|[?&])(url|u|redirect|redirect_url|target|dest|destination)=https?%3a/i.test(parsed.search)) score -= 45;
    if (/(^|[?&])(url|u|redirect|redirect_url|target|dest|destination)=https?:\/\//i.test(parsed.search)) score -= 45;
  } catch {
    if (/click|track|redirect/.test(combined)) score -= 25;
  }

  return score;
}

function normalizeUrl(url: string) {
  return url.replace(/[)\]>'".,]+$/g, '');
}

export function extractCodes(text: string) {
  return [...new Set([...text.matchAll(/\b\d{4,8}\b/g)].map((m) => m[0]))];
}

export function generatePersonaProfile(geoKey: string, persona: PersonaKey) {
  const gender = pickGender(persona);
  const firstNamePool = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  const firstName = firstNamePool[randomIndex(firstNamePool.length)];
  const lastName = LAST_NAMES[randomIndex(LAST_NAMES.length)];
  const age = randomAge(persona);
  const dateOfBirth = buildDateOfBirth(age);
  const geo = GEO_PROFILE_DEFAULTS[geoKey] ?? GEO_PROFILE_DEFAULTS.generic_intl;
  const region = geo.regions[randomIndex(geo.regions.length)] ?? GEO_PROFILE_DEFAULTS.generic_intl.regions[0];
  const city = region.cities[randomIndex(region.cities.length)];
  const postalBase = region.postalPrefixes[randomIndex(region.postalPrefixes.length)];
  const postalCode = `${postalBase}${randomDigits(3)}`;
  const street = region.streetPrefixes[randomIndex(region.streetPrefixes.length)];
  const addressLine = `${1 + crypto.randomInt(1, 250)} ${street}`;
  const placeOfBirth = city;
  const documentIssueDate = buildDocumentIssueDate(dateOfBirth);

  return {
    firstName,
    lastName,
    gender,
    age,
    dateOfBirth,
    country: geo.country,
    region: region.name?.trim() || 'Not specified',
    city,
    placeOfBirth,
    addressLine,
    postalCode,
    documentIssueDate,
    phone: randomPhone(geoKey),
    persona,
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

function randomAge(persona: PersonaKey) {
  switch (persona) {
    case 'young_user':
      return 18 + crypto.randomInt(0, 7);
    case 'senior_user':
      return 55 + crypto.randomInt(0, 21);
    case 'standard_user':
      return 25 + crypto.randomInt(0, 16);
    case 'male_user':
    case 'female_user':
    default:
      return 25 + crypto.randomInt(0, 31);
  }
}

function pickGender(persona: PersonaKey): Gender {
  if (persona === 'male_user') return 'male';
  if (persona === 'female_user') return 'female';
  return crypto.randomInt(0, 2) === 0 ? 'male' : 'female';
}

function buildDateOfBirth(age: number) {
  const now = new Date();
  const year = now.getUTCFullYear() - age;
  const month = 1 + crypto.randomInt(0, 12);
  const day = 1 + crypto.randomInt(0, 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildDocumentIssueDate(dateOfBirth: string) {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const earliest = new Date(Date.UTC(birthDate.getUTCFullYear() + 18, birthDate.getUTCMonth(), birthDate.getUTCDate()));
  const latest = new Date();
  const earliestTs = earliest.getTime();
  const latestTs = latest.getTime();

  if (!Number.isFinite(earliestTs) || earliestTs >= latestTs) {
    return formatDate(latest);
  }

  const issueDate = new Date(earliestTs + crypto.randomInt(0, latestTs - earliestTs + 1));
  return formatDate(issueDate);
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function randomIndex(length: number) {
  return crypto.randomInt(0, length);
}
