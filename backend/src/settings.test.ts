import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { ApiError } from './limits.js';
import { getUserSettings, getWorkspaceSettingsForApi, updateUserSettings, updateWorkspaceSettings } from './settings.js';

test('user settings can be stored and normalized', () => {
  const userId = createTestUser('user_settings');
  const updated = updateUserSettings(userId, {
    defaultGeo: 'zambia',
    defaultPersona: 'female_user',
    defaultDocumentType: 'national_id',
    bulkCount: 7,
  });

  assert.deepEqual(updated, {
    defaultGeo: 'zambia',
    defaultPersona: 'female_user',
    defaultDocumentType: 'national_id',
    bulkCount: 7,
  });
  assert.deepEqual(getUserSettings(userId), updated);
});

test('workspace settings can be updated by an owner and clamp unsafe numbers', () => {
  const userId = createTestUser('workspace_settings');
  const workspaceId = getDefaultWorkspaceForUser(userId);
  const updated = updateWorkspaceSettings(workspaceId, userId, {
    historyRetentionDays: 90,
    historyLimit: 2000,
    allowBulkGeneration: false,
    maxBulkCount: 12,
    mailboxProvider: 'mail_gw',
    sharedAccountEditing: 'owner_admin',
    workspaceCreationPolicy: 'owner_admin',
    accountsPerDay: 40,
    mailboxCreatePerDay: 41,
    inboxRefreshPerMinute: 6,
  });

  assert.equal(updated.historyRetentionDays, 90);
  assert.equal(updated.historyLimit, 1000);
  assert.equal(updated.allowBulkGeneration, false);
  assert.equal(updated.maxBulkCount, 12);
  assert.equal(updated.mailboxProvider, 'mail_gw');
  assert.equal(updated.sharedAccountEditing, 'owner_admin');
  assert.equal(updated.workspaceCreationPolicy, 'owner_admin');
  assert.equal(updated.accountsPerDay, 40);
  assert.equal(updated.mailboxCreatePerDay, 41);
  assert.equal(updated.inboxRefreshPerMinute, 6);
  assert.deepEqual(getWorkspaceSettingsForApi(workspaceId), updated);
});

test('workspace settings cannot be updated by a plain member', () => {
  const ownerId = createTestUser('workspace_owner');
  const memberId = createTestUser('workspace_member');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  db.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (?, ?, 'member')
  `).run(workspaceId, memberId);

  assert.throws(
    () => updateWorkspaceSettings(workspaceId, memberId, { historyLimit: 10 }),
    (error) => error instanceof ApiError && error.code === 'workspace_settings_forbidden' && error.status === 403,
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
