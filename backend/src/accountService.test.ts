import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { listGeoRules, generateAccount, getHistoryDetail, listHistory, updateSiteAccountId } from './services/accountService.js';
import type { EmailProvider } from './providers/emailProvider.js';
import { ApiError, enforceDailyLimit, getUsageSummary, recordUsageEvent, USAGE_EVENTS } from './limits.js';

const provider: EmailProvider = {
  async createAccount() {
    return { address: 'stub@mail.tm', password: 'secret' };
  },
  async fetchInbox() {
    return [{ plainText: 'Code 123456 and link https://example.com', html: '<b>Code 123456</b>' }];
  },
};

test('generation waits briefly for first inbox snapshot', async () => {
  let observedWaitMs = 0;
  const waitProvider: EmailProvider = {
    async createAccount() {
      return { address: 'wait@mail.tm', password: 'secret' };
    },
    async fetchInbox(_address, _password, waitMs) {
      observedWaitMs = waitMs ?? 0;
      return [];
    },
  };

  await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: waitProvider });
  assert.equal(observedWaitMs, 15000);
});

test('geo rules include required starter geos', () => {
  const labels = listGeoRules().map((item) => item.label);
  for (const label of [
    'Nigeria',
    'Kazakhstan',
    'Uzbekistan',
    'Ghana',
    'Georgia',
    'Ireland',
    'Angola',
    'Ethiopia',
    'Senegal',
    'Tanzania',
    'Zambia',
    'Uganda',
    'Kenya',
    'Cameroon',
    'Generic International',
  ]) {
    assert.ok(labels.includes(label));
  }
});

test('verified dataset geos keep country region and city as separate dependent fields', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'ghana', documentType: 'ghana_card_pin', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.country, 'Ghana');
  assert.ok(['Greater Accra', 'Ashanti'].includes(item?.region ?? ''));
  assert.ok(['Accra', 'Tema', 'Kumasi', 'Obuasi'].includes(item?.city ?? ''));
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

test('confirmed document rules are marked verified', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'nigeria', documentType: 'nin', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.documentQuality, 'verified');
  assert.match(item?.documentValue ?? '', /^\d{11}$/);
});

test('geo rules expose document options without registration URLs', async () => {
  const geoRule = listGeoRules().find((item) => item.key === 'zambia');
  assert.deepEqual(Object.keys(geoRule ?? {}).sort(), ['documentTypes', 'key', 'label']);
  assert.deepEqual(geoRule?.documentTypes.sort(), ['national_registration_card_number', 'passport']);
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

test('seed users receive default workspace settings and membership', () => {
  const workspaceId = getDefaultWorkspaceForUser(1);
  assert.ok(workspaceId > 0);

  const member = db.prepare(`
    SELECT role
    FROM workspace_members
    WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, 1) as { role: string } | undefined;
  assert.equal(member?.role, 'owner');

  const userSettings = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(1);
  const workspaceSettings = db.prepare('SELECT workspace_id FROM workspace_settings WHERE workspace_id = ?').get(workspaceId);
  assert.ok(userSettings);
  assert.ok(workspaceSettings);
});

test('generated history is linked to workspace and creator', async () => {
  const workspaceId = getDefaultWorkspaceForUser(1);
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.workspaceId, workspaceId);
  assert.equal(item?.createdByUserId, 1);

  const row = db.prepare(`
    SELECT workspace_id, created_by_user_id
    FROM account_history
    WHERE id = ?
  `).get(item!.id) as { workspace_id: number; created_by_user_id: number } | undefined;
  assert.equal(row?.workspace_id, workspaceId);
  assert.equal(row?.created_by_user_id, 1);
});

test('workspace scope keeps another seed user out of private history', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.ok(item);
  assert.equal(getHistoryDetail(item!.id, 2), null);
  assert.equal(listHistory(2).some((row: any) => row.id === item!.id), false);
});

test('workspace history limit trims generated identities per workspace setting', async () => {
  const userId = createTestUser('history_limit');
  const workspaceId = getDefaultWorkspaceForUser(userId);
  db.prepare('UPDATE workspace_settings SET history_limit = ? WHERE workspace_id = ?').run(2, workspaceId);

  await generateAccount({ userId, workspaceId, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  await generateAccount({ userId, workspaceId, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  await generateAccount({ userId, workspaceId, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });

  assert.equal(listHistory(userId, workspaceId).length, 2);
});

test('usage limits count quantity before allowing another provider call', () => {
  const userId = createTestUser('usage_limit');
  const workspaceId = getDefaultWorkspaceForUser(userId);
  db.prepare('UPDATE workspace_settings SET accounts_per_day = ? WHERE workspace_id = ?').run(2, workspaceId);

  recordUsageEvent(workspaceId, userId, USAGE_EVENTS.accountGenerated, 2);
  const summary = getUsageSummary(workspaceId, userId);
  assert.deepEqual(summary.limits.accountsPerDay, { used: 2, limit: 2, remaining: 0 });

  assert.throws(
    () => enforceDailyLimit(workspaceId, userId, USAGE_EVENTS.accountGenerated, 2, 'generation_limit_reached', 'Daily account generation limit reached'),
    (error) => error instanceof ApiError && error.code === 'generation_limit_reached' && error.status === 429,
  );
});

function createTestUser(prefix: string) {
  const login = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const result = db.prepare(`
    INSERT INTO users (login, password, role, email, username, status, updated_at)
    VALUES (?, '', 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}
