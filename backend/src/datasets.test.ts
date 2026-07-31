import test from 'node:test';
import assert from 'node:assert/strict';
import { countryDatasetSchema, generateDatasetDocument, generateDatasetPhone, listCountryDatasets, loadCountryDatasets, validateKazakhstanIin } from './datasets.js';
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
      assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)), `${dataset.key}: generated street is not in selected city`);
      assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes), `${dataset.key}: generated postal code is not valid for selected city`);

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

function expectedPostalCodePattern(geoKey: string, prefixes: string[]) {
  if (DATASET_GEOS_WITHOUT_PUBLIC_POSTCODES.has(geoKey)) return /^$/;
  const prefixPattern = prefixes.map(escapeRegExp).join('|');
  if (DATASET_COMPLETE_POSTAL_PREFIX_GEOS.has(geoKey)) return new RegExp(`^(?:${prefixPattern})$`);
  if (geoKey === 'ghana') return new RegExp(`^(?:${prefixPattern})\\d{4}$`);
  if (geoKey === 'ireland') return new RegExp(`^(?:${prefixPattern})[A-Z0-9]{4}$`);

  const suffixLength = DATASET_POSTAL_SUFFIX_LENGTHS[geoKey] ?? 3;
  return new RegExp(`^(?:${prefixPattern})\\d{${suffixLength}}$`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DATASET_GEOS_WITHOUT_PUBLIC_POSTCODES = new Set([
  'angola',
  'botswana',
  'burundi',
  'cameroon',
  'central_african_republic',
  'congo_brazzaville',
  'cote_divoire',
  'equatorial_guinea',
  'gabon',
  'guinea',
  'guinea_conakry',
  'mali',
  'rwanda',
  'sierra_leone',
  'south_sudan',
  'togo',
]);

const DATASET_COMPLETE_POSTAL_PREFIX_GEOS = new Set([
  'eswatini',
  'lesotho',
  'liberia',
  'senegal',
]);

const DATASET_POSTAL_SUFFIX_LENGTHS: Record<string, number> = {
  guinea_bissau: 1,
  kenya: 2,
  mozambique: 1,
  namibia: 2,
  niger: 1,
  south_africa: 1,
  swaziland: 2,
  tanzania: 2,
  uganda: 2,
  western_sahara: 2,
  zambia: 2,
  zimbabwe: 1,
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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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
    assert.ok(selectedCity.streets.some((street) => profile.addressLine.endsWith(street)));
    assert.match(profile.postalCode, expectedPostalCodePattern(dataset.key, selectedCity.postalPrefixes));

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

  assert.equal(dataset.documents.omang.quality, 'sample_verified');
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
  assert.equal(dataset.documents.passport.quality, 'synthetic_pattern');

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
