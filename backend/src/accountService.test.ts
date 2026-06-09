import test from 'node:test';
import assert from 'node:assert/strict';
import { listGeoRules, generateAccount } from './services/accountService.js';
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
  for (const label of ['Zambia', 'Uganda', 'Nigeria', 'Guinea', 'Uzbekistan', 'Kazakhstan', 'Generic International']) {
    assert.ok(labels.includes(label));
  }
});

test('missing rules yield missing_rules quality', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'uganda', documentType: 'national_id', role: 'user', emailProvider: provider });
  assert.equal(item?.documentQuality, 'missing_rules');
  assert.equal(item?.documentValue, 'Missing Rules');
  assert.equal(item?.emailPassword, 'secret');
});
