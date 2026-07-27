import nigeriaDataset from './datasets/nigeria.json' with { type: 'json' };
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
  nigeria_nin: () => randomDigits(11),
};

const countryDatasets = loadCountryDatasets([nigeriaDataset]);
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

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

function validateCountryDatasets(datasets: CountryDataset[]) {
  const keys = new Set<string>();
  const countryCodes = new Set<string>();

  for (const dataset of datasets) {
    if (keys.has(dataset.key)) throw new DatasetError(`Duplicate country dataset key: ${dataset.key}`);
    if (countryCodes.has(dataset.countryCode)) throw new DatasetError(`Duplicate country dataset countryCode: ${dataset.countryCode}`);
    keys.add(dataset.key);
    countryCodes.add(dataset.countryCode);

    for (const [documentType, rule] of Object.entries(dataset.documents)) {
      if (rule.generator && !documentGenerators[rule.generator]) {
        throw new DatasetError(`${dataset.key}.${documentType}: unknown generator ${rule.generator}`);
      }
    }
  }

  return datasets;
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
