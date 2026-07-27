import nigeriaDataset from './datasets/nigeria.json' with { type: 'json' };
import type { DocumentQuality, Gender } from './types.js';
import crypto from 'node:crypto';

export type DatasetQuality = 'verified' | 'sample_verified' | 'synthetic_pattern' | 'missing';
export type SourceType = 'official' | 'government_sample' | 'trusted_reference' | 'user_sample' | 'assumption';
export type Availability = 'draft' | 'review' | 'active';

export interface DatasetSource {
  title: string;
  url: string;
  type: SourceType;
  checkedAt: string;
}

export interface CountryDataset {
  key: string;
  label: string;
  countryCode: string;
  country: string;
  locale: string;
  availability: Availability;
  names: {
    male: string[];
    female: string[];
    last: string[];
    quality: DatasetQuality;
    source: DatasetSource;
    notes?: string;
  };
  phones: {
    countryCallingCode: string;
    nationalLength: number;
    prefixes: string[];
    quality: DatasetQuality;
    source: DatasetSource;
    notes?: string;
  };
  locations: {
    regions: Array<{
      name: string;
      cities: Array<{
        name: string;
        postalPrefixes: string[];
        streets: string[];
      }>;
    }>;
    quality: DatasetQuality;
    source: DatasetSource;
    notes?: string;
  };
  documents: Record<string, CountryDocumentRule>;
}

export interface CountryDocumentRule {
  label: string;
  templates?: string[];
  generator?: string;
  pattern: string;
  quality: Exclude<DocumentQuality, 'missing_rules'> | 'sample_verified';
  source: DatasetSource;
  notes?: string;
}

export interface DocumentGeneratorContext {
  dateOfBirth: string;
  gender: Gender;
  region?: string;
}

type DocumentGenerator = (context: DocumentGeneratorContext) => string;

const documentGenerators: Record<string, DocumentGenerator> = {
  nigeria_nin: () => randomDigits(11),
};

const countryDatasets = [nigeriaDataset as CountryDataset];
const countryDatasetByKey = new Map(countryDatasets.map((dataset) => [dataset.key, dataset]));

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

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
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

function formatDateOfBirthYyMmDd(dateOfBirth?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!match) return randomDigits(6);
  return `${match[1].slice(-2)}${match[2]}${match[3]}`;
}

function randomInt(length: number) {
  return crypto.randomInt(0, length);
}
