import angolaDataset from './datasets/angola.json' with { type: 'json' };
import beninDataset from './datasets/benin.json' with { type: 'json' };
import botswanaDataset from './datasets/botswana.json' with { type: 'json' };
import burkinaFasoDataset from './datasets/burkina_faso.json' with { type: 'json' };
import burundiDataset from './datasets/burundi.json' with { type: 'json' };
import caboVerdeDataset from './datasets/cabo_verde.json' with { type: 'json' };
import cameroonDataset from './datasets/cameroon.json' with { type: 'json' };
import centralAfricanRepublicDataset from './datasets/central_african_republic.json' with { type: 'json' };
import congoBrazzavilleDataset from './datasets/congo_brazzaville.json' with { type: 'json' };
import congoKinshasaDataset from './datasets/congo_kinshasa.json' with { type: 'json' };
import coteDivoireDataset from './datasets/cote_divoire.json' with { type: 'json' };
import equatorialGuineaDataset from './datasets/equatorial_guinea.json' with { type: 'json' };
import eswatiniDataset from './datasets/eswatini.json' with { type: 'json' };
import ethiopiaDataset from './datasets/ethiopia.json' with { type: 'json' };
import gabonDataset from './datasets/gabon.json' with { type: 'json' };
import gambiaDataset from './datasets/gambia.json' with { type: 'json' };
import genericIntlDataset from './datasets/generic_intl.json' with { type: 'json' };
import georgiaDataset from './datasets/georgia.json' with { type: 'json' };
import ghanaDataset from './datasets/ghana.json' with { type: 'json' };
import guineaDataset from './datasets/guinea.json' with { type: 'json' };
import guineaBissauDataset from './datasets/guinea_bissau.json' with { type: 'json' };
import guineaConakryDataset from './datasets/guinea_conakry.json' with { type: 'json' };
import irelandDataset from './datasets/ireland.json' with { type: 'json' };
import kazakhstanDataset from './datasets/kazakhstan.json' with { type: 'json' };
import kenyaDataset from './datasets/kenya.json' with { type: 'json' };
import lesothoDataset from './datasets/lesotho.json' with { type: 'json' };
import liberiaDataset from './datasets/liberia.json' with { type: 'json' };
import malawiDataset from './datasets/malawi.json' with { type: 'json' };
import maliDataset from './datasets/mali.json' with { type: 'json' };
import mauritiusDataset from './datasets/mauritius.json' with { type: 'json' };
import mozambiqueDataset from './datasets/mozambique.json' with { type: 'json' };
import namibiaDataset from './datasets/namibia.json' with { type: 'json' };
import nigerDataset from './datasets/niger.json' with { type: 'json' };
import nigeriaDataset from './datasets/nigeria.json' with { type: 'json' };
import rwandaDataset from './datasets/rwanda.json' with { type: 'json' };
import senegalDataset from './datasets/senegal.json' with { type: 'json' };
import sierraLeoneDataset from './datasets/sierra_leone.json' with { type: 'json' };
import southAfricaDataset from './datasets/south_africa.json' with { type: 'json' };
import southSudanDataset from './datasets/south_sudan.json' with { type: 'json' };
import swazilandDataset from './datasets/swaziland.json' with { type: 'json' };
import tanzaniaDataset from './datasets/tanzania.json' with { type: 'json' };
import togoDataset from './datasets/togo.json' with { type: 'json' };
import ugandaDataset from './datasets/uganda.json' with { type: 'json' };
import uzbekistanDataset from './datasets/uzbekistan.json' with { type: 'json' };
import westernSaharaDataset from './datasets/western_sahara.json' with { type: 'json' };
import zambiaDataset from './datasets/zambia.json' with { type: 'json' };
import zimbabweDataset from './datasets/zimbabwe.json' with { type: 'json' };
import type { Gender } from './types.js';
import crypto from 'node:crypto';
import { z } from 'zod';

const datasetQualitySchema = z.enum(['verified', 'sample_verified', 'synthetic_pattern', 'missing']);
const sourceTypeSchema = z.enum(['official', 'government_sample', 'trusted_reference', 'user_sample', 'assumption']);
const availabilitySchema = z.enum(['draft', 'review', 'active']);
const checkedAtSchema = z.iso.date().refine((value) => Date.parse(`${value}T00:00:00Z`) <= Date.now(), {
  message: 'checkedAt cannot be in the future',
});

const datasetSourceSchema = z.strictObject({
  title: z.string().min(1),
  url: z.string().url(),
  type: sourceTypeSchema,
  checkedAt: checkedAtSchema,
});

const citySchema = z.strictObject({
  name: z.string().min(1),
  postalPrefixes: z.array(z.string().min(1)).min(1),
  streets: z.array(z.string().min(1)).min(1),
});

const documentRuleSchema = z.strictObject({
  label: z.string().min(1),
  templates: z.array(z.string().min(1)).min(1).optional(),
  generator: z.string().min(1).optional(),
  pattern: z.string().min(1),
  quality: z.enum(['verified', 'sample_verified', 'synthetic_pattern']),
  source: datasetSourceSchema,
  notes: z.string().min(1).optional(),
}).refine((rule) => Boolean(rule.generator) !== Boolean(rule.templates?.length), {
  message: 'Document rule must define exactly one of generator or templates',
});

export const countryDatasetSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z_]*$/),
  label: z.string().min(1),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  country: z.string().min(1),
  locale: z.string().min(2),
  availability: availabilitySchema,
  names: z.strictObject({
    male: z.array(z.string().min(1)).min(1),
    female: z.array(z.string().min(1)).min(1),
    last: z.array(z.string().min(1)).min(1),
    quality: datasetQualitySchema,
    source: datasetSourceSchema,
    notes: z.string().min(1).optional(),
  }),
  phones: z.strictObject({
    countryCallingCode: z.string().regex(/^\+\d+$/),
    nationalLength: z.number().int().positive(),
    prefixes: z.array(z.string().regex(/^\d+$/)).min(1),
    quality: datasetQualitySchema,
    source: datasetSourceSchema,
    notes: z.string().min(1).optional(),
  }),
  locations: z.strictObject({
    regions: z.array(z.strictObject({
      name: z.string().min(1),
      cities: z.array(citySchema).min(1),
    })).min(1),
    quality: datasetQualitySchema,
    source: datasetSourceSchema,
    notes: z.string().min(1).optional(),
  }),
  documents: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), documentRuleSchema).refine((documents) => Object.keys(documents).length > 0, {
    message: 'At least one document rule is required',
  }),
}).superRefine((dataset, ctx) => {
  for (const prefix of dataset.phones.prefixes) {
    if (prefix.length > dataset.phones.nationalLength) {
      ctx.addIssue({
        code: 'custom',
        path: ['phones', 'prefixes'],
        message: `Phone prefix ${prefix} exceeds nationalLength`,
      });
    }
  }
});

export type DatasetQuality = z.infer<typeof datasetQualitySchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type DatasetSource = z.infer<typeof datasetSourceSchema>;
export type CountryDocumentRule = z.infer<typeof documentRuleSchema>;
export type CountryDataset = z.infer<typeof countryDatasetSchema>;

export interface DocumentGeneratorContext {
  dateOfBirth: string;
  gender: Gender;
  region?: string;
}

type DocumentGenerator = (context: DocumentGeneratorContext) => string;

const documentGenerators: Record<string, DocumentGenerator> = {
  gabon_nip: generateGabonNip,
  kazakhstan_iin: generateKazakhstanIin,
  nigeria_nin: () => randomDigits(11),
};

const countryDatasets = loadCountryDatasets([
  angolaDataset,
  beninDataset,
  botswanaDataset,
  burkinaFasoDataset,
  burundiDataset,
  caboVerdeDataset,
  cameroonDataset,
  centralAfricanRepublicDataset,
  congoBrazzavilleDataset,
  congoKinshasaDataset,
  coteDivoireDataset,
  equatorialGuineaDataset,
  eswatiniDataset,
  ethiopiaDataset,
  gabonDataset,
  gambiaDataset,
  genericIntlDataset,
  georgiaDataset,
  ghanaDataset,
  guineaDataset,
  guineaBissauDataset,
  guineaConakryDataset,
  irelandDataset,
  kazakhstanDataset,
  kenyaDataset,
  lesothoDataset,
  liberiaDataset,
  malawiDataset,
  maliDataset,
  mauritiusDataset,
  mozambiqueDataset,
  namibiaDataset,
  nigerDataset,
  nigeriaDataset,
  rwandaDataset,
  senegalDataset,
  sierraLeoneDataset,
  southAfricaDataset,
  southSudanDataset,
  swazilandDataset,
  tanzaniaDataset,
  togoDataset,
  ugandaDataset,
  uzbekistanDataset,
  westernSaharaDataset,
  zambiaDataset,
  zimbabweDataset,
]);
const countryDatasetByKey = new Map(countryDatasets.map((dataset) => [dataset.key, dataset]));

export function loadCountryDatasets(rawDatasets: unknown[]) {
  return validateCountryDatasets(rawDatasets.map((dataset) => countryDatasetSchema.parse(dataset)));
}

export function listCountryDatasets() {
  return countryDatasets;
}

export function getCountryDataset(geoKey: string) {
  return countryDatasetByKey.get(geoKey) ?? null;
}

export function generateDatasetDocument(rule: CountryDocumentRule, context: DocumentGeneratorContext) {
  if (rule.generator) {
    const generator = documentGenerators[rule.generator];
    if (!generator) throw new DatasetError(`Unknown document generator: ${rule.generator}`);
    return generator(context);
  }

  if (!rule.templates?.length) {
    throw new DatasetError(`Document rule has no templates or generator: ${rule.label}`);
  }

  return fillTemplate(pickTemplate(rule.templates), { dateOfBirth: context.dateOfBirth });
}

export function generateDatasetPhone(dataset: CountryDataset) {
  const prefix = dataset.phones.prefixes[randomInt(dataset.phones.prefixes.length)];
  const remaining = dataset.phones.nationalLength - prefix.length;
  if (remaining < 0) throw new DatasetError(`${dataset.label}: phone prefix ${prefix} exceeds national length`);
  return `${dataset.phones.countryCallingCode}${prefix}${randomDigits(remaining)}`;
}

export function validateKazakhstanIin(value: string) {
  if (!/^\d{12}$/.test(value)) return false;
  return calculateKazakhstanIinCheckDigit(value.slice(0, 11)) === Number(value[11]);
}

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

function validateCountryDatasets(datasets: CountryDataset[]) {
  const keys = new Set<string>();

  for (const dataset of datasets) {
    if (keys.has(dataset.key)) throw new DatasetError(`Duplicate country dataset key: ${dataset.key}`);
    keys.add(dataset.key);

    for (const [documentType, rule] of Object.entries(dataset.documents)) {
      if (rule.generator && !documentGenerators[rule.generator]) {
        throw new DatasetError(`${dataset.key}.${documentType}: unknown generator ${rule.generator}`);
      }
    }
  }

  return datasets;
}

function generateGabonNip(context: DocumentGeneratorContext) {
  const birthDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(context.dateOfBirth);
  if (!birthDateMatch) throw new DatasetError(`Invalid Gabon NIP birth date: ${context.dateOfBirth}`);

  return `${randomAlphaNumeric(2)}${randomDigits(4)}${birthDateMatch[1]}${birthDateMatch[2]}${birthDateMatch[3]}`;
}

function generateKazakhstanIin(context: DocumentGeneratorContext) {
  const birthDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(context.dateOfBirth);
  if (!birthDateMatch) throw new DatasetError(`Invalid Kazakhstan IIN birth date: ${context.dateOfBirth}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const body = `${birthDateMatch[1].slice(-2)}${birthDateMatch[2]}${birthDateMatch[3]}${kazakhstanCenturyGenderDigit(Number(birthDateMatch[1]), context.gender)}${randomDigits(4)}`;
    const checkDigit = calculateKazakhstanIinCheckDigit(body);
    if (checkDigit !== null) return `${body}${checkDigit}`;
  }

  throw new DatasetError('Unable to generate Kazakhstan IIN with a valid checksum');
}

function kazakhstanCenturyGenderDigit(year: number, gender: Gender) {
  if (year >= 2000 && year <= 2099) return gender === 'male' ? '5' : '6';
  if (year >= 1900 && year <= 1999) return gender === 'male' ? '3' : '4';
  if (year >= 1800 && year <= 1899) return gender === 'male' ? '1' : '2';
  throw new DatasetError(`Kazakhstan IIN unsupported birth year: ${year}`);
}

function calculateKazakhstanIinCheckDigit(body: string) {
  if (!/^\d{11}$/.test(body)) return null;
  const digits = [...body].map(Number);
  const firstWeights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const secondWeights = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  const first = weightedMod11(digits, firstWeights);
  if (first !== 10) return first;
  const second = weightedMod11(digits, secondWeights);
  return second === 10 ? null : second;
}

function weightedMod11(digits: number[], weights: number[]) {
  return digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11;
}

function fillTemplate(template: string, context: { dateOfBirth?: string } = {}) {
  return template
    .replace('{DOB_YYMMDD}', formatDateOfBirthYyMmDd(context.dateOfBirth))
    .replace(/\{RANDL(\d+)\}/g, (_, letters) => randomLetters(Number(letters)))
    .replace(/\{RAND(\d+)\}/g, (_, digits) => randomDigits(Number(digits)));
}

function pickTemplate(templates: string[]) {
  return templates[crypto.randomInt(0, templates.length)];
}

function randomDigits(length: number) {
  const bytes = crypto.randomBytes(length);
  return Array.from({ length }, (_, i) => String(bytes[i] % 10)).join('');
}

function randomLetters(length: number) {
  const bytes = crypto.randomBytes(length);
  return Array.from({ length }, (_, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[bytes[i] % 26]).join('');
}

function randomAlphaNumeric(length: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  return Array.from({ length }, (_, i) => alphabet[bytes[i] % alphabet.length]).join('');
}

function formatDateOfBirthYyMmDd(dateOfBirth?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!match) return randomDigits(6);
  return `${match[1].slice(-2)}${match[2]}${match[3]}`;
}

function randomInt(length: number) {
  return crypto.randomInt(0, length);
}
