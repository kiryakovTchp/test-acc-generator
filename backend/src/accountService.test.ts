import test from 'node:test';
import assert from 'node:assert/strict';
import { listGeoRules, generateAccount, getHistoryDetail, updateSiteAccountId } from './services/accountService.js';
import type { EmailProvider } from './providers/emailProvider.js';

const provider: EmailProvider = {
  async createAccount() {
    return { address: 'stub@mail.tm', password: 'secret' };
  },
  async fetchInbox() {
    return [{ plainText: 'Code 123456 and link https://example.com', html: '<b>Code 123456</b>' }];
  },
};

test('geo rules include required starter geos', () => {
  const labels = listGeoRules().map((item) => item.label);
  for (const label of ['Zambia', 'Uganda', 'Nigeria', 'Guinea', 'Uzbekistan', 'Kazakhstan', 'South Sudan', 'Generic International']) {
    assert.ok(labels.includes(label));
  }
});

test('south sudan generation keeps country region and city as separate dependent fields', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'south_sudan', documentType: 'national_id', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.country, 'South Sudan');
  assert.ok(['Central Equatoria', 'Western Bahr el Ghazal', 'Upper Nile'].includes(item?.region ?? ''));
  assert.ok(['Juba', 'Terekeka', 'Wau', 'Malakal'].includes(item?.city ?? ''));
  assert.equal(item?.placeOfBirth, item?.city);
});

test('site account id can be manually set after registration', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  const updated = updateSiteAccountId(item!.id, 1, ' 1695604249 ');
  assert.equal(updated?.siteAccountId, '1695604249');
  assert.match(updated?.fullProfileText ?? '', /Account ID: 1695604249/);
});

test('missing rules yield missing_rules quality', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'uganda', documentType: 'national_id', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.documentQuality, 'missing_rules');
  assert.equal(item?.documentValue, 'Missing Rules');
  assert.equal(item?.emailPassword, 'secret');
  assert.equal(item?.country, 'Uganda');
  assert.match(item?.region ?? '', /Region/);
  assert.ok(item?.placeOfBirth);
  assert.match(item?.documentIssueDate ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

test('geo rules expose document options without registration URLs', async () => {
  const geoRule = listGeoRules().find((item) => item.key === 'zambia');
  assert.deepEqual(Object.keys(geoRule ?? {}).sort(), ['documentTypes', 'key', 'label']);
  assert.deepEqual(geoRule?.documentTypes.sort(), ['national_id', 'passport']);
});

test('generic geo fallback uses not specified region', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'generic_intl', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.country, 'United Kingdom');
  assert.equal(item?.region, 'Not specified');
  assert.ok(['London', 'Manchester', 'Birmingham'].includes(item?.city ?? ''));
  assert.equal(item?.placeOfBirth, item?.city);
});

test('history detail hides raw html unless debug payload is explicitly requested', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.inbox.rawHtml, null);

  const debugItem = getHistoryDetail(item!.id, 1, true);
  assert.equal(debugItem?.inbox.rawHtml, '<b>Code 123456</b>');
});
