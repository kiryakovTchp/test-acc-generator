import test from 'node:test';
import assert from 'node:assert/strict';
import { countryDatasetSchema, generateDatasetDocument, generateDatasetPhone, listCountryDatasets, loadCountryDatasets } from './datasets.js';
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
  const dataset = listCountryDatasets()[0];

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
  const dataset = listCountryDatasets()[0];

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

test('country dataset keys and country codes are unique', () => {
  const datasets = listCountryDatasets();

  assert.equal(new Set(datasets.map((item) => item.key)).size, datasets.length);
  assert.equal(new Set(datasets.map((item) => item.countryCode)).size, datasets.length);
});

test('nigeria dataset generates internally consistent profiles', () => {
  const dataset = listCountryDatasets().find((item) => item.key === 'nigeria');
  assert.ok(dataset);

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.ok(selectedCity.postalPrefixes.some((prefix) => profile.postalCode.startsWith(prefix)));

    assert.match(profile.phone, phonePattern);
    const nationalNumber = profile.phone.slice(dataset.phones.countryCallingCode.length);
    assert.equal(nationalNumber.length, dataset.phones.nationalLength);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
    assert.equal(nationalNumber.startsWith('0'), false);
  }
});

test('nigeria document rules match their configured patterns', () => {
  const dataset = listCountryDatasets().find((item) => item.key === 'nigeria');
  assert.ok(dataset);

  for (let i = 0; i < 1000; i += 1) {
    for (const rule of Object.values(dataset.documents)) {
      const value = generateDatasetDocument(rule, { dateOfBirth: '1991-07-27', gender: 'male', region: 'Lagos' });
      assert.match(value, new RegExp(rule.pattern), `${rule.label}: ${value} did not match ${rule.pattern}`);
    }
  }
});

test('nigeria phone generator follows national length and allowed prefixes', () => {
  const dataset = listCountryDatasets().find((item) => item.key === 'nigeria');
  assert.ok(dataset);

  for (let i = 0; i < 1000; i += 1) {
    const phone = generateDatasetPhone(dataset);
    assert.ok(phone.startsWith('+234'));
    const nationalNumber = phone.slice('+234'.length);
    assert.equal(nationalNumber.length, 10);
    assert.ok(dataset.phones.prefixes.some((prefix) => nationalNumber.startsWith(prefix)));
    assert.equal(nationalNumber.startsWith('0'), false);
  }
});
