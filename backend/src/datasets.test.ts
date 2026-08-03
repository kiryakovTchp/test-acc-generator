import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countryDatasetSchema, generateDatasetDocument, generateDatasetPhone, listCountryDatasets, loadCountryDatasets, validateKazakhstanIin } from './datasets.js';
import type { CountryDataset } from './datasets.js';
import { calculateAge, generatePersonaProfile } from './utils.js';

test('country datasets have required blocks and sources', () => {
  for (const dataset of listCountryDatasets()) {
    assert.equal(Boolean(dataset.key), true, `${dataset.label}: key is missing`);
    assert.ok(dataset.names.male.length > 0, `${dataset.label}: male names are missing`);
    assert.ok(dataset.names.female.length > 0, `${dataset.label}: female names are missing`);
    assert.ok(dataset.names.last.length > 0, `${dataset.label}: last names are missing`);
    assert.ok(dataset.phones.prefixes.length > 0, `${dataset.label}: phone prefixes are missing`);
    assert.ok(dataset.locations.regions.length > 0, `${dataset.label}: regions are missing`);
    assert.ok(Object.keys(dataset.documents).length > 0, `${dataset.label}: document rules are missing`);
    assert.match(dataset.names.source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(dataset.phones.source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(dataset.locations.source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('all document templates and generators repeatedly match their own pattern', () => {
  for (const dataset of listCountryDatasets()) {
    for (const [documentType, rule] of Object.entries(dataset.documents)) {
      const pattern = new RegExp(rule.pattern);
      for (let i = 0; i < 250; i += 1) {
        const value = generateDatasetDocument(rule, {
          dateOfBirth: i % 2 === 0 ? '1991-07-27' : '2002-01-09',
          gender: i % 2 === 0 ? 'female' : 'male',
          region: dataset.locations.regions[0].name,
        });
        assert.match(value, pattern, `${dataset.key}.${documentType}: ${value} did not match ${rule.pattern}`);
      }
    }
  }
});

test('official specimen values match the expected runtime pattern without promoting full national grammar', () => {
  const specimens = [
    ['gabon', 'passport', '13SP01349'],
    ['malawi', 'passport', 'MWA123456'],
    ['malawi', 'passport', 'MWZ123456'],
    ['malawi', 'personal_number', '1212433/2'],
    ['sierra_leone', 'passport', '0114439'],
    ['sierra_leone', 'personal_number', '000119146'],
    ['tanzania', 'national_identification_number', '19760517-37227-00002-17'],
  ] as const;

  for (const [datasetKey, documentType, specimen] of specimens) {
    const rule = getDataset(datasetKey).documents[documentType];
    assert.ok(rule, `${datasetKey}.${documentType}: missing runtime rule`);
    assert.match(specimen, new RegExp(rule.pattern), `${datasetKey}.${documentType}: specimen ${specimen} does not match ${rule.pattern}`);
  }

  assert.equal(getDataset('gabon').documents.passport.quality, 'sample_verified');
  assert.equal(getDataset('gabon').documents.personal_identification_number.quality, 'synthetic_pattern');
});

test('verified document quality is not based on local samples assumptions or PRADO listings alone', () => {
  for (const dataset of listCountryDatasets()) {
    for (const [documentType, rule] of Object.entries(dataset.documents)) {
      if (rule.quality !== 'verified') continue;
      assert.notEqual(rule.source.type, 'user_sample', `${dataset.key}.${documentType}: verified cannot use user_sample`);
      assert.notEqual(rule.source.type, 'government_sample', `${dataset.key}.${documentType}: one government sample is not enough for verified`);
      assert.notEqual(rule.source.type, 'assumption', `${dataset.key}.${documentType}: verified cannot use assumption`);
      assert.doesNotMatch(rule.source.url, /consilium\.europa\.eu\/prado\/.*(?:docs-per-|prado-documents)/, `${dataset.key}.${documentType}: verified cannot rely on PRADO listings`);
    }
  }
});

test('unconfirmed country MRZ or document labels are not generated as document numbers', () => {
  const forbiddenLiteralTemplatePrefixes = /^(?:ZMP|ZWP|NRC|CNI|NIC|BI|NID|NINA|SZ|ID)\{/;

  for (const dataset of listCountryDatasets()) {
    for (const [documentType, rule] of Object.entries(dataset.documents)) {
      for (const template of rule.templates ?? []) {
        assert.doesNotMatch(template, forbiddenLiteralTemplatePrefixes, `${dataset.key}.${documentType}: ${template} includes an unconfirmed document/country marker`);
      }
    }
  }
});

test('document verification report stays synchronized with runtime rules', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const report = fs.readFileSync(path.join(root, 'docs/DOCUMENT_DATASET_VERIFICATION.md'), 'utf8');
  const rows = report.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---') && !line.includes(' Document type '));
  const runtimeRules = listCountryDatasets().flatMap((dataset) => Object.keys(dataset.documents).map((documentType) => `${dataset.key} | ${documentType}`));

  assert.equal(rows.length, runtimeRules.length, 'document verification row count must match runtime document rules');
  for (const ruleKey of runtimeRules) {
    const [datasetKey, documentType] = ruleKey.split(' | ');
    assert.ok(report.includes(`| ${datasetKey} |`), `${datasetKey}: missing from document verification report`);
    assert.ok(report.includes(`| ${documentType} |`), `${datasetKey}.${documentType}: missing document type from verification report`);
  }

  assert.match(report, /Runtime inventory: 93 document rules; 12 verified, 8 sample_verified, 73 synthetic_pattern\./);
  assert.doesNotMatch(report, /Official source confirms runtime shape/);
  assert.doesNotMatch(report, /Sample-level shape \^/);
});

test('document verification matches require explicit independent evidence', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const report = fs.readFileSync(path.join(root, 'docs/DOCUMENT_DATASET_VERIFICATION.md'), 'utf8');
  const rows = report.split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| ---') && !line.includes(' Document type '))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

  for (const row of rows) {
    const [datasetKey, , documentType, , , , evidenceType, evidenceDescription, , observedShape, verdict, quality] = row;
    if (verdict !== 'match') continue;

    assert.notEqual(evidenceType, 'none', `${datasetKey}.${documentType}: match requires explicit evidence`);
    assert.notEqual(observedShape, 'none', `${datasetKey}.${documentType}: match requires observed shape`);
    assert.doesNotMatch(evidenceDescription, /runtime quality|runtime pattern/i, `${datasetKey}.${documentType}: evidence must not be derived from runtime`);
    if (quality === 'verified') assert.equal(evidenceType, 'explicit_grammar', `${datasetKey}.${documentType}: verified match requires explicit_grammar`);
    if (quality === 'sample_verified') assert.equal(evidenceType, 'readable_specimen', `${datasetKey}.${documentType}: sample_verified match requires readable_specimen`);
  }
});

test('kazakhstan iin verification report uses official semantic and checksum evidence', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const report = fs.readFileSync(path.join(root, 'docs/DOCUMENT_DATASET_VERIFICATION.md'), 'utf8');
  const row = report.split('\n').find((line) => line.startsWith('| kazakhstan |') && line.includes('| iin |'));

  assert.ok(row, 'kazakhstan.iin: missing from document verification report');
  assert.match(row, /https:\/\/adilet\.zan\.kz\/rus\/docs\/V2300032942/);
  assert.match(row, /https:\/\/adilet\.zan\.kz\/rus\/docs\/P030000565_/);
  assert.match(row, /explicit_grammar/);
  assert.match(row, /two-cycle control digit|two-cycle mod 11/);
  assert.match(row, /YYMMDD birth date/);
  assert.match(row, /sex\/century/);
  assert.match(row, /citizen-style/);
  assert.match(row, /do not reject assigned IINs on DOB, sex, or century semantics/);
  assert.match(row, /foreigner and historical registrations can contain exceptions/);
  assert.match(row, /\| match \| verified \|/);
  assert.doesNotMatch(row, /No independent evidence entry|Runtime quality\/source type/);
});

test('country dataset schema rejects misspelled required fields and invalid source dates', () => {
  const dataset = listCountryDatasets()[0];
  assert.throws(
    () => countryDatasetSchema.parse({
      ...dataset,
      phones: {
        countryCallingCode: dataset.phones.countryCallingCode,
        nationalLenght: dataset.phones.nationalLength,
        prefixes: dataset.phones.prefixes,
        quality: dataset.phones.quality,
        source: dataset.phones.source,
      },
    }),
    /nationalLength/,
  );

  assert.throws(
    () => countryDatasetSchema.parse({
      ...dataset,
      names: {
        ...dataset.names,
        source: {
          ...dataset.names.source,
          checkedAt: '2026-99-99',
        },
      },
    }),
    /checkedAt/,
  );
});

test('country dataset schema rejects unknown fields and ambiguous document generation', () => {
  const dataset = getDataset('nigeria');

  assert.throws(
    () => countryDatasetSchema.parse({
      ...dataset,
      phones: {
        ...dataset.phones,
        nationalLenght: 11,
      },
    }),
    /unrecognized_keys|nationalLenght/,
  );

  assert.throws(
    () => countryDatasetSchema.parse({
      ...dataset,
      documents: {
        ...dataset.documents,
        ambiguous_passport: {
          ...dataset.documents.passport,
          generator: 'nigeria_nin',
        },
      },
    }),
    /exactly one/,
  );
});

test('country dataset loader rejects unknown generators and duplicate identities', () => {
  const dataset = getDataset('nigeria');

  assert.throws(
    () => loadCountryDatasets([{
      ...dataset,
      documents: {
        ...dataset.documents,
        nin: {
          ...dataset.documents.nin,
          generator: 'nigeria_nni',
        },
      },
    }]),
    /unknown generator nigeria_nni/,
  );

  assert.throws(
    () => loadCountryDatasets([dataset, { ...dataset, label: 'Nigeria Copy' }]),
    /Duplicate country dataset key: nigeria/,
  );
});

test('country dataset keys are unique and country code aliases are allowed', () => {
  const datasets = listCountryDatasets();

  assert.equal(new Set(datasets.map((item) => item.key)).size, datasets.length);
  assert.equal(getDataset('guinea').countryCode, getDataset('guinea_conakry').countryCode);
  assert.equal(getDataset('swaziland').countryCode, getDataset('eswatini').countryCode);
});

test('all country datasets generate linked profiles and matching documents', () => {
  for (const dataset of listCountryDatasets()) {
    const maleNames = new Set(dataset.names.male);
    const femaleNames = new Set(dataset.names.female);
    const lastNames = new Set(dataset.names.last);
    const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));

    for (let i = 0; i < 100; i += 1) {
      const profile = generatePersonaProfile(dataset.key, i % 2 === 0 ? 'male_user' : 'female_user');
      assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName), `${dataset.key}: generated first name is not in dataset`);
      assert.ok(lastNames.has(profile.lastName), `${dataset.key}: generated last name is not in dataset`);
      assert.equal(profile.country, dataset.country);
      assert.equal(profile.age, calculateAge(profile.dateOfBirth));

      const selectedRegion = regionMap.get(profile.region);
      assert.ok(selectedRegion, `${dataset.key}: ${profile.region} is not in dataset`);
      const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
      assert.ok(selectedCity, `${dataset.key}: ${profile.city} is not in ${profile.region}`);
      assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

      const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
      assert.equal(nationalNumber.length, dataset.phones.nationalLength, `${dataset.key}: phone national length mismatch`);
      assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)), `${dataset.key}: phone prefix is not allowed`);
    }

    for (const rule of Object.values(dataset.documents)) {
      for (let i = 0; i < 100; i += 1) {
        const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'female', region: dataset.locations.regions[0].name });
        assert.match(value, new RegExp(rule.pattern), `${dataset.key}.${rule.label}: ${value} did not match ${rule.pattern}`);
      }
    }
  }
});

test('sierra leone phone generator excludes cancelled ITU NDCs', () => {
  const dataset = listCountryDatasets().find((item) => item.key === 'sierra_leone');
  assert.ok(dataset);
  assert.deepEqual(dataset.phones.prefixes.filter((prefix) => ['21', '40', '44', '50', '55'].includes(prefix)), []);
  assert.ok(dataset.phones.prefixes.includes('31'));
  assert.ok(dataset.phones.prefixes.includes('35'));

  for (let i = 0; i < 200; i += 1) {
    const nationalNumber = generateDatasetPhone(dataset).slice(dataset.phones.countryCallingCode.length);
    assert.doesNotMatch(nationalNumber, /^(?:21|40|44|50|55)/);
  }
});

test('tanzania phone generator follows TCRA 2026 operational mobile ranges', () => {
  const dataset = listCountryDatasets().find((item) => item.key === 'tanzania');
  assert.ok(dataset);
  assert.deepEqual(dataset.phones.prefixes, ['61', '62', '63', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79']);

  for (let i = 0; i < 200; i += 1) {
    const nationalNumber = generateDatasetPhone(dataset).slice(dataset.phones.countryCallingCode.length);
    assert.doesNotMatch(nationalNumber, /^64/);
    assert.match(nationalNumber, /^(?:6[1-3]|6[5-9]|7[0-9])\d{7}$/);
  }
});

function assertProfileUsesVerifiedAddress(
  dataset: CountryDataset,
  selectedCity: ReturnType<typeof getDataset>['locations']['regions'][number]['cities'][number],
  addressLine: string,
  postalCode: string,
) {
  const geoKey = dataset.key;
  assert.ok(selectedCity.addresses.length > 0, `${geoKey}.${selectedCity.name}: missing verified address records`);
  for (const address of selectedCity.addresses) {
    assert.ok(address.addressLine.trim(), `${geoKey}.${selectedCity.name}: addressLine is empty`);
    assert.match(address.source.url, /^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/, `${geoKey}.${selectedCity.name}: address source is not an OSM object URL`);
    assert.equal(address.source.type, 'map_reference');
    assert.match(address.source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(address.osmType, `${geoKey}.${selectedCity.name}: missing osmType`);
    assert.ok(address.osmId, `${geoKey}.${selectedCity.name}: missing osmId`);
    assert.ok(address.nominatimLookupUrl, `${geoKey}.${selectedCity.name}: missing Nominatim lookup URL`);
    assert.ok(address.nominatimSnapshot, `${geoKey}.${selectedCity.name}: missing Nominatim snapshot`);
    assert.notEqual(address.postalCode, address.poBox ?? '__no_po_box__');
    assert.notEqual(address.postalCode, address.plusCode ?? '__no_plus_code__');
    if (address.postalCode) {
      assertValidPostalCodeShape(dataset, address.postalCode);
      assert.equal(address.addressLine.includes(address.postalCode), false, `${geoKey}.${selectedCity.name}: addressLine already contains postalCode`);
    }
  }

  assert.ok(
    selectedCity.addresses.some((address) => address.addressLine === addressLine && (address.postalCode ?? '') === postalCode),
    `${geoKey}.${selectedCity.name}: generated address/postcode pair was not copied from dataset`,
  );
}

function assertValidPostalCodeShape(dataset: CountryDataset, postalCode: string) {
  assert.doesNotMatch(postalCode, /\b(?:po\s*box|p\.o\.\s*box|bp)\b/i, `${dataset.key}: postalCode contains PO box marker`);
  assert.doesNotMatch(postalCode, /^0{4,}$/, `${dataset.key}: postalCode is a placeholder zero value`);
  assert.notEqual(postalCode, dataset.phones.countryCallingCode);
  assert.notEqual(postalCode, dataset.phones.countryCallingCode.replace('+', '00'));

  const pattern = POSTAL_CODE_PATTERNS_BY_GEO[dataset.key];
  if (pattern) assert.match(postalCode, pattern, `${dataset.key}: postalCode does not match known country format`);
}

const POSTAL_CODE_PATTERNS_BY_GEO: Record<string, RegExp> = {
  congo_kinshasa: /^\d{7}$/,
  ghana: /^[A-Z]{2}-\d{3}(?:-\d{4})?$/,
  malawi: /^\d{6}$/,
  mozambique: /^\d{4}$/,
  uganda: /^\d{5}$/,
  zambia: /^\d{5}$/,
};

test('benin dataset generates internally consistent profiles', () => {
  const dataset = getDataset('benin');

  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));
    assert.ok(profile.age >= 25 && profile.age <= 40);

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    assert.ok(profile.phone.startsWith(dataset.phones.countryCallingCode));
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
  }
});

test('botswana dataset generates internally consistent profiles', () => {
  const dataset = getDataset('botswana');

  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));
    assert.ok(profile.age >= 25 && profile.age <= 40);

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    assert.ok(profile.phone.startsWith(dataset.phones.countryCallingCode));
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
  }
});

test('burkina faso dataset generates internally consistent profiles', () => {
  const dataset = getDataset('burkina_faso');

  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));
    assert.ok(profile.age >= 25 && profile.age <= 40);

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    assert.ok(profile.phone.startsWith(dataset.phones.countryCallingCode));
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
  }
});

test('burundi dataset generates internally consistent profiles', () => {
  const dataset = getDataset('burundi');

  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));
  assert.ok(regionMap.get('Burunga')?.cities.some((city) => city.name === 'Makamba'));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));
    assert.ok(profile.age >= 25 && profile.age <= 40);

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    assert.ok(profile.phone.startsWith(dataset.phones.countryCallingCode));
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
  }
});

test('gabon dataset generates internally consistent profiles', () => {
  const dataset = getDataset('gabon');

  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));
  assert.ok(regionMap.get('Nyanga')?.cities.some((city) => city.name === 'Tchibanga'));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));
    assert.ok(profile.age >= 25 && profile.age <= 40);

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    assert.ok(profile.phone.startsWith(dataset.phones.countryCallingCode));
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
    assert.equal(nationalNumber.startsWith('0'), false);
  }
});

test('nigeria dataset generates internally consistent profiles', () => {
  const dataset = getDataset('nigeria');

  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));
  const phonePattern = new RegExp(`^\\${dataset.phones.countryCallingCode}\\d{${dataset.phones.nationalLength}}$`);

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));
    assert.ok(profile.age >= 25 && profile.age <= 40);

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    assert.match(profile.phone, phonePattern);
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
    assert.equal(nationalNumber.startsWith('0'), false);
  }
});

test('kazakhstan dataset generates internally consistent profiles', () => {
  const dataset = getDataset('kazakhstan');
  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
  }
});

test("cote d'ivoire dataset generates internally consistent profiles", () => {
  const dataset = getDataset('cote_divoire');
  const maleNames = new Set(dataset.names.male);
  const femaleNames = new Set(dataset.names.female);
  const lastNames = new Set(dataset.names.last);
  const regionMap = new Map(dataset.locations.regions.map((region) => [region.name, region]));

  for (let i = 0; i < 1000; i += 1) {
    const profile = generatePersonaProfile(dataset.key, 'standard_user');
    assert.ok(maleNames.has(profile.firstName) || femaleNames.has(profile.firstName));
    assert.ok(lastNames.has(profile.lastName));
    assert.equal(profile.country, dataset.country);
    assert.equal(profile.age, calculateAge(profile.dateOfBirth));

    const selectedRegion = regionMap.get(profile.region);
    assert.ok(selectedRegion, `${profile.region}: generated region is not in dataset`);
    const selectedCity = selectedRegion.cities.find((city) => city.name === profile.city);
    assert.ok(selectedCity, `${profile.city}: generated city is not in ${profile.region}`);
    assertProfileUsesVerifiedAddress(dataset, selectedCity, profile.addressLine, profile.postalCode);

    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
  }
});

test('nigeria document rules match their configured patterns', () => {
  const dataset = getDataset('nigeria');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'male', region: 'Lagos' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('benin document rules match configured public-source limits', () => {
  const dataset = getDataset('benin');

  assert.equal(dataset.documents.national_personal_identification_number.quality, 'synthetic_pattern');
  assert.equal(dataset.documents.passport.quality, 'synthetic_pattern');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'female', region: 'Littoral' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('botswana document rules match configured public-source limits', () => {
  const dataset = getDataset('botswana');

  assert.equal(dataset.documents.omang.quality, 'synthetic_pattern');
  assert.equal(dataset.documents.passport.quality, 'synthetic_pattern');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'female', region: 'Gaborone City' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('burkina faso document rules match configured public-source limits', () => {
  const dataset = getDataset('burkina_faso');

  assert.equal(dataset.documents.national_personal_identification_number.quality, 'verified');
  assert.equal(dataset.documents.passport.quality, 'synthetic_pattern');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'male', region: 'Centre' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('burundi document rules match configured public-source limits', () => {
  const dataset = getDataset('burundi');

  assert.equal(dataset.documents.national_identity_card_number.quality, 'synthetic_pattern');
  assert.equal(dataset.documents.passport.quality, 'synthetic_pattern');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'female', region: 'Bujumbura' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('gabon document rules match configured public-source limits', () => {
  const dataset = getDataset('gabon');
  const nipRule = dataset.documents.personal_identification_number;

  assert.equal(nipRule.quality, 'synthetic_pattern');
  assert.equal(dataset.documents.passport.quality, 'sample_verified');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'male', region: 'Estuaire' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }

  const nip = generateDatasetDocument(nipRule, { dateOfBirth: '1991-07-27', gender: 'male', region: 'Estuaire' });
  assert.match(nip, /^[A-Z0-9]{2}\d{12}$/);
  assert.equal(nip.slice(6), '19910727');
});

test('kazakhstan iin document matches birth date gender and checksum', () => {
  const dataset = getDataset('kazakhstan');
  const iinRule = dataset.documents.iin;

  for (let i = 0; i < 1000; i += 1) {
    const gender = i % 2 === 0 ? 'male' : 'female';
    const dateOfBirth = i % 3 === 0 ? '1991-07-27' : '2001-02-03';
    const value = generateDatasetDocument(iinRule, { dateOfBirth, gender, region: 'Almaty' });
    assert.match(value, /^\d{12}$/);
    assert.equal(value.slice(0, 6), dateOfBirth.replace(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/, '$2$3$4'));
    assert.equal(Number(value[6]) % 2 === 1, gender === 'male');
    assert.equal(validateKazakhstanIin(value), true);
  }
});

test('kazakhstan iin checksum validator does not reject semantic exceptions', () => {
  assert.equal(validateKazakhstanIin('990101000004'), true);
});

test("cote d'ivoire document rules match provided patterns", () => {
  const dataset = getDataset('cote_divoire');

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'female', region: 'Abidjan' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('nigeria phone generator follows national length and allowed prefixes', () => {
  const dataset = getDataset('nigeria');

  for (let i = 0; i < 1000; i += 1) {
    const phone = generateDatasetPhone(dataset);
    assert.ok(phone.startsWith('+234'));
    const nationalNumber = phone.slice('+234'.length);
    assert.equal(nationalNumber.length, 10);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
    assert.equal(nationalNumber.startsWith('0'), false);
  }
});

function getDataset(key: string) {
  const dataset = listCountryDatasets().find((item) => item.key === key);
  assert.ok(dataset);
  return dataset;
}
