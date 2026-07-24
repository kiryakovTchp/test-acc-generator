import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { cleanupOldHistory, listGeoRules, generateAccount, getHistoryDetail, listHistory, refreshInbox, regeneratePhone, replaceMailbox, updateAccountBalanceStatus, updateHistorySharing, updatePhone, updateSiteAccountId } from './services/accountService.js';
import type { EmailProvider } from './providers/emailProvider.js';
import { ApiError, enforceDailyLimit, getUsageSummary, recordUsageEvent, USAGE_EVENTS } from './limits.js';
import { listActivityEvents } from './activity.js';
import { updateWorkspaceSettings } from './settings.js';

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
    'Gambia',
    'Malawi',
    'Sierra Leone',
    'Togo',
    'Gabon',
    "Cote d'Ivoire",
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

test('malawi dataset follows PRADO specimen passport shapes', async () => {
  const passport = await generateAccount({ userId: 1, geoKey: 'malawi', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(passport?.country, 'Malawi');
  assert.equal(passport?.documentQuality, 'synthetic_pattern');
  assert.match(passport?.documentValue ?? '', /^\d{6}$/);

  const personalNumber = await generateAccount({ userId: 1, geoKey: 'malawi', documentType: 'personal_number', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(personalNumber?.documentQuality, 'synthetic_pattern');
  assert.match(personalNumber?.documentValue ?? '', /^\d{7}\/\d$/);
});

test('sierra leone and togo dataset follow provided document specimens', async () => {
  const sierraLeonePassport = await generateAccount({ userId: 1, geoKey: 'sierra_leone', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(sierraLeonePassport?.country, 'Sierra Leone');
  assert.equal(sierraLeonePassport?.documentQuality, 'synthetic_pattern');
  assert.match(sierraLeonePassport?.documentValue ?? '', /^\d{7}$/);

  const sierraLeonePersonal = await generateAccount({ userId: 1, geoKey: 'sierra_leone', documentType: 'personal_number', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.match(sierraLeonePersonal?.documentValue ?? '', /^\d{9}$/);

  const togoPassport = await generateAccount({ userId: 1, geoKey: 'togo', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(togoPassport?.country, 'Togo');
  assert.equal(togoPassport?.documentQuality, 'synthetic_pattern');
  assert.match(togoPassport?.documentValue ?? '', /^X[BS]\d{6}$/);

  const togoDiplomatic = await generateAccount({ userId: 1, geoKey: 'togo', documentType: 'diplomatic_passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.match(togoDiplomatic?.documentValue ?? '', /^D\d{7}$/);

  const togoDriverLicence = await generateAccount({ userId: 1, geoKey: 'togo', documentType: 'driver_license_number', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.match(togoDriverLicence?.documentValue ?? '', /^\d{8}$/);
});

test('gabon dataset follows provided PRADO passport specimen', async () => {
  const passport = await generateAccount({ userId: 1, geoKey: 'gabon', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(passport?.country, 'Gabon');
  assert.equal(passport?.documentQuality, 'synthetic_pattern');
  assert.match(passport?.documentValue ?? '', /^\d{2}SP\d{5}$/);
});

test("cote d'ivoire dataset follows provided document shapes", async () => {
  const passport = await generateAccount({ userId: 1, geoKey: 'cote_divoire', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(passport?.country, "Cote d'Ivoire");
  assert.equal(passport?.documentQuality, 'synthetic_pattern');
  assert.match(passport?.documentValue ?? '', /^\d{2}[A-Z]{2}\d{5}$/);

  const nationalId = await generateAccount({ userId: 1, geoKey: 'cote_divoire', documentType: 'national_id', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.match(nationalId?.documentValue ?? '', /^CI\d{9}$/);

  const driverLicence = await generateAccount({ userId: 1, geoKey: 'cote_divoire', documentType: 'driver_license_number', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.match(driverLicence?.documentValue ?? '', /^[A-Z]{4}\d{2}-\d{2}-\d{8}[A-Z]$/);
});

test('kazakhstan iin starts with profile date of birth', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'kazakhstan', documentType: 'iin', role: 'user', persona: 'standard_user', emailProvider: provider });
  const birthPrefix = (item?.dateOfBirth ?? '').replace(/^(\d{2})(\d{2})-(\d{2})-(\d{2})$/, '$2$3$4');
  assert.equal(item?.documentQuality, 'verified');
  assert.match(item?.documentValue ?? '', /^\d{12}$/);
  assert.equal(item?.documentValue.slice(0, 6), birthPrefix);
});

test('gabon generated names come from the Gabon profile pool', async () => {
  const maleNames = new Set(['Alain', 'Jean', 'Patrick', 'Brice', 'Cedric', 'Marc', 'Christian', 'Landry']);
  const femaleNames = new Set(['Marie', 'Chantal', 'Sandrine', 'Estelle', 'Prisca', 'Nadine', 'Ariane', 'Justine']);
  const lastNames = new Set(['Mba', 'Ondo', 'Obame', 'Ndong', 'Nguema', 'Essono', 'Ebang', 'Moussavou', 'Oyono']);

  for (let i = 0; i < 10; i += 1) {
    const item = await generateAccount({ userId: 1, geoKey: 'gabon', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
    assert.ok(maleNames.has(item?.firstName ?? '') || femaleNames.has(item?.firstName ?? ''));
    assert.ok(lastNames.has(item?.lastName ?? ''));
    assert.notEqual(item?.lastName, 'Bekov');
  }
});

test('site account id can be manually set after registration', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  const updated = updateSiteAccountId(item!.id, 1, ' 1695604249 ');
  assert.equal(updated?.siteAccountId, '1695604249');
  assert.match(updated?.fullProfileText ?? '', /Account ID: 1695604249/);
});

test('account balance status can be set after registration', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.equal(item?.balanceStatus, 'unknown');

  const updated = updateAccountBalanceStatus(item!.id, 1, 'has_balance');
  assert.equal(updated?.balanceStatus, 'has_balance');
  assert.match(updated?.fullProfileText ?? '', /Balance Status: Has balance/);

  const listItem = (listHistory(1) as Array<{ id: number; balanceStatus: string }>).find((entry) => entry.id === item?.id);
  assert.equal(listItem?.balanceStatus, 'has_balance');
  assert.ok(listActivityEvents(item!.workspaceId, 1).some((event) => event.eventType === 'balance_status_changed' && event.entityId === String(item!.id)));
});

test('phone can be regenerated without changing the rest of the identity', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'gabon', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  const updated = regeneratePhone(item!.id, 1);

  assert.ok(updated);
  assert.notEqual(updated?.phone, item?.phone);
  assert.match(updated?.phone ?? '', /^\+24106\d{7}$/);
  assert.equal(updated?.firstName, item?.firstName);
  assert.equal(updated?.lastName, item?.lastName);
  assert.equal(updated?.documentValue, item?.documentValue);
  assert.equal(updated?.email, item?.email);
  assert.match(updated?.fullProfileText ?? '', new RegExp(`Phone: ${updated?.phone.replace('+', '\\+')}`));
});

test('mailbox can be replaced without changing identity data', async () => {
  let nextMailbox = 0;
  const replaceProvider: EmailProvider = {
    async createAccount() {
      nextMailbox += 1;
      return { address: `replacement-${nextMailbox}@mail.tm`, password: `secret-${nextMailbox}`, provider: 'mail_tm' };
    },
    async fetchInbox() {
      return [];
    },
  };
  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  const updated = await replaceMailbox({ id: item!.id, userId: 1, emailProvider: replaceProvider });

  assert.equal(updated?.email, 'replacement-1@mail.tm');
  assert.equal(updated?.emailPassword, 'secret-1');
  assert.equal(updated?.mailboxProvider, 'mail_tm');
  assert.equal(updated?.inbox.status, 'no_email_found');
  assert.equal(updated?.firstName, item?.firstName);
  assert.equal(updated?.lastName, item?.lastName);
  assert.equal(updated?.documentValue, item?.documentValue);
  assert.equal(updated?.phone, item?.phone);
  assert.match(updated?.fullProfileText ?? '', /Email: replacement-1@mail\.tm/);
  assert.ok(listActivityEvents(item!.workspaceId, 1).some((event) => event.eventType === 'mailbox_replaced' && event.entityId === String(item!.id)));
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
  assert.match(item?.phone ?? '', /^\+23480\d{8}$/);
});

test('phone can be manually edited after generation', async () => {
  const item = await generateAccount({ userId: 1, geoKey: 'nigeria', documentType: 'nin', role: 'user', persona: 'standard_user', emailProvider: provider });
  const updated = updatePhone(item!.id, 1, ' +234 812 345 6789 ');
  assert.equal(updated?.phone, '+234 812 345 6789');
  assert.match(updated?.fullProfileText ?? '', /Phone: \+234 812 345 6789/);

  assert.throws(() => updatePhone(item!.id, 1, '123'), /Phone must contain 6 to 18 digits/);
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

test('generated history records the mailbox provider used for creation', async () => {
  const providerWithName: EmailProvider = {
    async createAccount() {
      return { address: 'stub@mail.gw', password: 'secret', provider: 'mail_gw' };
    },
    async fetchInbox() {
      return [];
    },
  };

  const item = await generateAccount({ userId: 1, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: providerWithName });
  assert.equal(item?.mailboxProvider, 'mail_gw');

  const row = db.prepare(`
    SELECT mailbox_provider
    FROM account_history
    WHERE id = ?
  `).get(item!.id) as { mailbox_provider: string } | undefined;
  assert.equal(row?.mailbox_provider, 'mail_gw');
});

test('generation reads inbox with the provider that created the mailbox', async () => {
  let primaryFetchCalls = 0;
  let fallbackFetchCalls = 0;
  const fallbackCreateProvider: EmailProvider = {
    async createAccount() {
      return { address: 'stub@mail.gw', password: 'secret', provider: 'mail_gw' };
    },
    async fetchInbox() {
      primaryFetchCalls += 1;
      throw new Error('wrong provider');
    },
  };
  const mailGwReadProvider: EmailProvider = {
    async createAccount() {
      throw new Error('not used');
    },
    async fetchInbox() {
      fallbackFetchCalls += 1;
      return [{ plainText: 'Code 654321' }];
    },
  };

  const item = await generateAccount({
    userId: 1,
    geoKey: 'zambia',
    documentType: 'passport',
    role: 'user',
    persona: 'standard_user',
    emailProvider: fallbackCreateProvider,
    emailProviderForAccount: (providerKey) => providerKey === 'mail_gw' ? mailGwReadProvider : fallbackCreateProvider,
  });

  assert.equal(item?.mailboxProvider, 'mail_gw');
  assert.equal(primaryFetchCalls, 0);
  assert.equal(fallbackFetchCalls, 1);
});

test('workspace members see only their own account history until an account is shared', async () => {
  const ownerId = createTestUser('history_owner');
  const memberId = createTestUser('history_member');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, memberId, 'member');

  const item = await generateAccount({ userId: ownerId, workspaceId, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.ok(item);
  assert.ok(listActivityEvents(workspaceId, ownerId).some((event) => event.eventType === 'account_generated' && event.entityId === String(item!.id)));
  assert.equal(listHistory(memberId, workspaceId).some((row: any) => row.id === item!.id), false);
  assert.equal(getHistoryDetail(item!.id, memberId, false, workspaceId), null);

  const shared = updateHistorySharing(item!.id, ownerId, true, false, workspaceId);
  assert.equal(shared?.sharedWithWorkspace, true);
  assert.ok(listActivityEvents(workspaceId, ownerId).some((event) => event.eventType === 'account_shared' && event.entityId === String(item!.id)));
  assert.equal(listHistory(memberId, workspaceId).some((row: any) => row.id === item!.id && row.sharedWithWorkspace), true);
  assert.equal(getHistoryDetail(item!.id, memberId, false, workspaceId)?.email, item?.email);
  assert.equal(getHistoryDetail(item!.id, memberId, true, workspaceId)?.inbox.rawHtml, null);
  assert.equal(getHistoryDetail(item!.id, ownerId, true, workspaceId)?.inbox.rawHtml, '<b>Code 123456</b>');

  assert.equal(updateAccountBalanceStatus(item!.id, memberId, 'has_balance', false, workspaceId), null);
  db.prepare("UPDATE workspace_members SET role = 'admin' WHERE workspace_id = ? AND user_id = ?").run(workspaceId, memberId);
  updateWorkspaceSettings(workspaceId, ownerId, { sharedAccountEditing: 'owner_admin' });
  assert.equal(updateAccountBalanceStatus(item!.id, memberId, 'has_balance', false, workspaceId)?.balanceStatus, 'has_balance');
  assert.equal((await refreshInbox(item!.id, memberId, provider, 0, false, workspaceId))?.inbox.status, 'email_received');
  assert.equal(await replaceMailbox({ id: item!.id, userId: memberId, emailProvider: provider, workspaceId }), null);

  const privateAgain = updateHistorySharing(item!.id, ownerId, false, false, workspaceId);
  assert.equal(privateAgain?.sharedWithWorkspace, false);
  assert.ok(listActivityEvents(workspaceId, ownerId).some((event) => event.eventType === 'account_unshared' && event.entityId === String(item!.id)));
  assert.equal(getHistoryDetail(item!.id, memberId, false, workspaceId), null);
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

test('retention cleanup removes expired workspace history without user action', async () => {
  const userId = createTestUser('retention_cleanup');
  const workspaceId = getDefaultWorkspaceForUser(userId);
  db.prepare('UPDATE workspace_settings SET history_retention_days = ? WHERE workspace_id = ?').run(1, workspaceId);

  const item = await generateAccount({ userId, workspaceId, geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user', emailProvider: provider });
  assert.ok(item);
  db.prepare("UPDATE account_history SET created_at = datetime('now', '-2 days') WHERE id = ?").run(item!.id);

  assert.equal(cleanupOldHistory(), 1);
  assert.equal(getHistoryDetail(item!.id, userId, false, workspaceId), null);
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
