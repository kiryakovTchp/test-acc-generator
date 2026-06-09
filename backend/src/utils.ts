import crypto from 'node:crypto';
import type { Gender, PersonaKey } from './types.js';

const MALE_FIRST_NAMES = ['John', 'Michael', 'David', 'Daniel', 'James', 'Alex', 'Samuel', 'Peter', 'Joseph', 'Brian'];
const FEMALE_FIRST_NAMES = ['Grace', 'Mary', 'Esther', 'Ruth', 'Anna', 'Joy', 'Alice', 'Sarah', 'Diana', 'Lydia'];
const LAST_NAMES = ['Banda', 'Phiri', 'Zulu', 'Mwansa', 'Tembo', 'Okoro', 'Adebayo', 'Diallo', 'Camara', 'Toure', 'Kimani', 'Ndlovu', 'Moyo', 'Ibrahim', 'Khan', 'Aliyev', 'Sadykova', 'Bekov', 'Mendes', 'Costa'];

const GEO_PROFILE_DEFAULTS: Record<string, { country: string; cities: string[]; postalPrefixes: string[]; streetPrefixes: string[] }> = {
  zambia: { country: 'Zambia', cities: ['Lusaka', 'Ndola', 'Kitwe'], postalPrefixes: ['101', '102', '103'], streetPrefixes: ['Kafue Road', 'Freedom Way', 'Church Road'] },
  uganda: { country: 'Uganda', cities: ['Kampala', 'Entebbe', 'Jinja'], postalPrefixes: ['25', '26', '27'], streetPrefixes: ['Jinja Road', 'Acacia Avenue', 'Kira Road'] },
  nigeria: { country: 'Nigeria', cities: ['Lagos', 'Abuja', 'Port Harcourt'], postalPrefixes: ['100', '900', '500'], streetPrefixes: ['Allen Avenue', 'Adetokunbo Ademola', 'Aba Road'] },
  guinea: { country: 'Guinea', cities: ['Conakry', 'Kankan', 'Kindia'], postalPrefixes: ['001', '101', '201'], streetPrefixes: ['Rue KA', 'Rue Niger', 'Avenue Republique'] },
  uzbekistan: { country: 'Uzbekistan', cities: ['Tashkent', 'Samarkand', 'Bukhara'], postalPrefixes: ['100', '140', '200'], streetPrefixes: ['Amir Temur', 'Navoi Street', 'Mustaqillik'] },
  kazakhstan: { country: 'Kazakhstan', cities: ['Almaty', 'Astana', 'Shymkent'], postalPrefixes: ['050', '010', '160'], streetPrefixes: ['Abay Avenue', 'Dostyk Street', 'Tauke Khan'] },
  generic_intl: { country: 'United Kingdom', cities: ['London', 'Manchester', 'Birmingham'], postalPrefixes: ['SW1', 'M1', 'B1'], streetPrefixes: ['King Street', 'Victoria Road', 'High Street'] },
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
  return [...text.matchAll(/https?:\/\/[^\s]+/g)].map((m) => m[0]);
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
  const city = geo.cities[randomIndex(geo.cities.length)];
  const postalBase = geo.postalPrefixes[randomIndex(geo.postalPrefixes.length)];
  const postalCode = `${postalBase}${randomDigits(3)}`;
  const street = geo.streetPrefixes[randomIndex(geo.streetPrefixes.length)];
  const addressLine = `${1 + crypto.randomInt(1, 250)} ${street}`;

  return {
    firstName,
    lastName,
    gender,
    age,
    dateOfBirth,
    country: geo.country,
    city,
    addressLine,
    postalCode,
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

function randomIndex(length: number) {
  return crypto.randomInt(0, length);
}
