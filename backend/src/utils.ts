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
  nigeria: {
    country: 'Nigeria',
    regions: [
      { name: 'Lagos', cities: ['Lagos', 'Ikeja'], postalPrefixes: ['100', '101'], streetPrefixes: ['Allen Avenue', 'Broad Street'] },
      { name: 'Federal Capital Territory', cities: ['Abuja'], postalPrefixes: ['900'], streetPrefixes: ['Adetokunbo Ademola', 'Ahmadu Bello Way'] },
      { name: 'Rivers', cities: ['Port Harcourt'], postalPrefixes: ['500'], streetPrefixes: ['Aba Road', 'Peter Odili Road'] },
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
  uzbekistan: {
    country: 'Uzbekistan',
    regions: [
      { name: 'Tashkent Region', cities: ['Tashkent'], postalPrefixes: ['100'], streetPrefixes: ['Amir Temur', 'Mustaqillik'] },
      { name: 'Samarkand Region', cities: ['Samarkand', 'Bukhara'], postalPrefixes: ['140', '200'], streetPrefixes: ['Navoi Street', 'Registan Street'] },
    ],
  },
  ghana: {
    country: 'Ghana',
    regions: [
      { name: 'Greater Accra', cities: ['Accra', 'Tema'], postalPrefixes: ['00233', '00234'], streetPrefixes: ['Independence Avenue', 'Ring Road'] },
      { name: 'Ashanti', cities: ['Kumasi', 'Obuasi'], postalPrefixes: ['00235', '00236'], streetPrefixes: ['Prempeh I Street', 'Harper Road'] },
    ],
  },
  georgia: {
    country: 'Georgia',
    regions: [
      { name: 'Tbilisi', cities: ['Tbilisi'], postalPrefixes: ['010'], streetPrefixes: ['Rustaveli Avenue', 'Aghmashenebeli Avenue'] },
      { name: 'Adjara', cities: ['Batumi'], postalPrefixes: ['600'], streetPrefixes: ['Chavchavadze Street', 'Gorgiladze Street'] },
      { name: 'Imereti', cities: ['Kutaisi'], postalPrefixes: ['460'], streetPrefixes: ['Tsereteli Street', 'Queen Tamar Avenue'] },
    ],
  },
  ireland: {
    country: 'Ireland',
    regions: [
      { name: 'County Dublin', cities: ['Dublin'], postalPrefixes: ['D01', 'D02'], streetPrefixes: ['OConnell Street', 'Dame Street'] },
      { name: 'County Cork', cities: ['Cork'], postalPrefixes: ['T12'], streetPrefixes: ['Patrick Street', 'Oliver Plunkett Street'] },
      { name: 'County Galway', cities: ['Galway'], postalPrefixes: ['H91'], streetPrefixes: ['Shop Street', 'Eyre Square'] },
    ],
  },
  angola: {
    country: 'Angola',
    regions: [
      { name: 'Luanda', cities: ['Luanda'], postalPrefixes: ['100'], streetPrefixes: ['Avenida 4 de Fevereiro', 'Rua Amilcar Cabral'] },
      { name: 'Huila', cities: ['Lubango'], postalPrefixes: ['130'], streetPrefixes: ['Avenida da Independencia', 'Rua da Se'] },
      { name: 'Benguela', cities: ['Benguela', 'Lobito'], postalPrefixes: ['120'], streetPrefixes: ['Avenida Aires de Almeida Santos', 'Rua 31 de Janeiro'] },
    ],
  },
  gambia: {
    country: 'Gambia',
    regions: [
      { name: 'Banjul', cities: ['Banjul'], postalPrefixes: ['220'], streetPrefixes: ['Independence Drive', 'Marina Parade'] },
      { name: 'Kanifing', cities: ['Serekunda', 'Bakau'], postalPrefixes: ['221'], streetPrefixes: ['Kairaba Avenue', 'Pipeline Road'] },
      { name: 'West Coast', cities: ['Brikama'], postalPrefixes: ['222'], streetPrefixes: ['Brikama Highway', 'Kombo Coastal Road'] },
    ],
  },
  malawi: {
    country: 'Malawi',
    regions: [
      { name: 'Southern Region', cities: ['Blantyre', 'Zomba'], postalPrefixes: ['300', '310'], streetPrefixes: ['Victoria Avenue', 'Chileka Road'] },
      { name: 'Central Region', cities: ['Lilongwe', 'Dedza'], postalPrefixes: ['200', '220'], streetPrefixes: ['M1 Road', 'Paul Kagame Road'] },
      { name: 'Northern Region', cities: ['Mzuzu'], postalPrefixes: ['400'], streetPrefixes: ['Orton Chirwa Avenue', 'Katoto Road'] },
    ],
  },
  sierra_leone: {
    country: 'Sierra Leone',
    regions: [
      { name: 'Western Area', cities: ['Freetown'], postalPrefixes: ['100'], streetPrefixes: ['Siaka Stevens Street', 'Wilkinson Road'] },
      { name: 'Eastern Province', cities: ['Kenema', 'Koidu'], postalPrefixes: ['300', '330'], streetPrefixes: ['Hangha Road', 'Kono Highway'] },
      { name: 'Northern Province', cities: ['Makeni'], postalPrefixes: ['400'], streetPrefixes: ['Magburaka Road', 'Azzolini Highway'] },
    ],
  },
  togo: {
    country: 'Togo',
    regions: [
      { name: 'Maritime', cities: ['Lome', 'Aneho'], postalPrefixes: ['100', '110'], streetPrefixes: ['Boulevard du 13 Janvier', 'Avenue de la Liberation'] },
      { name: 'Plateaux', cities: ['Kpalime', 'Atakpame'], postalPrefixes: ['200', '220'], streetPrefixes: ['Route de Kpalime', 'Avenue de la Gare'] },
      { name: 'Kara', cities: ['Kara'], postalPrefixes: ['400'], streetPrefixes: ['Avenue des Nations', 'Route de Niamtougou'] },
    ],
  },
  gabon: {
    country: 'Gabon',
    regions: [
      { name: 'Estuaire', cities: ['Libreville'], postalPrefixes: ['100'], streetPrefixes: ['Boulevard Triomphal', 'Avenue Leon Mba'] },
      { name: 'Ogooue-Maritime', cities: ['Port-Gentil'], postalPrefixes: ['300'], streetPrefixes: ['Avenue Savorgnan de Brazza', 'Route de Sogara'] },
      { name: 'Haut-Ogooue', cities: ['Franceville'], postalPrefixes: ['600'], streetPrefixes: ['Avenue de la Renovation', 'Route de Moanda'] },
    ],
  },
  ethiopia: {
    country: 'Ethiopia',
    regions: [
      { name: 'Addis Ababa', cities: ['Addis Ababa'], postalPrefixes: ['100'], streetPrefixes: ['Bole Road', 'Africa Avenue'] },
      { name: 'Dire Dawa', cities: ['Dire Dawa'], postalPrefixes: ['300'], streetPrefixes: ['Keira Road', 'Dechatu Street'] },
      { name: 'Amhara', cities: ['Bahir Dar'], postalPrefixes: ['600'], streetPrefixes: ['Lake Avenue', 'Tana Road'] },
    ],
  },
  senegal: {
    country: 'Senegal',
    regions: [
      { name: 'Dakar', cities: ['Dakar', 'Pikine'], postalPrefixes: ['110'], streetPrefixes: ['Avenue Cheikh Anta Diop', 'Rue Carnot'] },
      { name: 'Thies', cities: ['Thies'], postalPrefixes: ['210'], streetPrefixes: ['Avenue General de Gaulle', 'Route de Mbour'] },
      { name: 'Diourbel', cities: ['Touba'], postalPrefixes: ['310'], streetPrefixes: ['Avenue Cheikh Ahmadou Bamba', 'Route de Darou'] },
    ],
  },
  tanzania: {
    country: 'Tanzania',
    regions: [
      { name: 'Dar es Salaam', cities: ['Dar es Salaam'], postalPrefixes: ['111'], streetPrefixes: ['Morogoro Road', 'Ali Hassan Mwinyi Road'] },
      { name: 'Dodoma', cities: ['Dodoma'], postalPrefixes: ['411'], streetPrefixes: ['Nyerere Road', 'Uhuru Street'] },
      { name: 'Mwanza', cities: ['Mwanza'], postalPrefixes: ['331'], streetPrefixes: ['Nyerere Road', 'Kenyatta Road'] },
    ],
  },
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
  kenya: {
    country: 'Kenya',
    regions: [
      { name: 'Nairobi County', cities: ['Nairobi'], postalPrefixes: ['001'], streetPrefixes: ['Kenyatta Avenue', 'Mombasa Road'] },
      { name: 'Mombasa County', cities: ['Mombasa'], postalPrefixes: ['801'], streetPrefixes: ['Moi Avenue', 'Digo Road'] },
      { name: 'Kisumu County', cities: ['Kisumu'], postalPrefixes: ['401'], streetPrefixes: ['Oginga Odinga Road', 'Jomo Kenyatta Highway'] },
    ],
  },
  cameroon: {
    country: 'Cameroon',
    regions: [
      { name: 'Centre', cities: ['Yaounde'], postalPrefixes: ['100'], streetPrefixes: ['Avenue Kennedy', 'Boulevard du 20 Mai'] },
      { name: 'Littoral', cities: ['Douala'], postalPrefixes: ['200'], streetPrefixes: ['Boulevard de la Liberte', 'Rue Joffre'] },
      { name: 'Northwest', cities: ['Bamenda'], postalPrefixes: ['300'], streetPrefixes: ['Commercial Avenue', 'Hospital Road'] },
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

export function pickTemplate(templates: string[]) {
  return templates[crypto.randomInt(0, templates.length)];
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
    nigeria: '+23480',
    kazakhstan: '+770',
    uzbekistan: '+99891',
    ghana: '+23323',
    georgia: '+995555',
    ireland: '+35385',
    angola: '+244923',
    gambia: '+22030',
    malawi: '+26588',
    sierra_leone: '+23276',
    togo: '+22890',
    gabon: '+24106',
    ethiopia: '+25191',
    senegal: '+22170',
    tanzania: '+25562',
    zambia: '+26095',
    uganda: '+25671',
    kenya: '+254712',
    cameroon: '+237671',
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
