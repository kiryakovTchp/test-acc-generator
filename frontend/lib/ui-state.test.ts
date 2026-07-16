import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceStatusLabel,
  buildSettingsTabs,
  isWorkspaceShared,
  mapDetailStatus,
  mapHistoryStatus,
  roleTone,
  scopeLabel,
  statusLabel,
  statusTone,
} from './ui-state';

test('history statuses map inbox state to dashboard state', () => {
  assert.equal(mapHistoryStatus({ inboxStatus: 'email_received' }), 'email_received');
  assert.equal(mapHistoryStatus({ inboxStatus: 'no_email_found' }), 'waiting');
  assert.equal(mapHistoryStatus({ inboxStatus: 'waiting_for_email' }), 'waiting');
  assert.equal(mapHistoryStatus({}), 'generated');
});

test('detail status labels and tones stay consistent', () => {
  assert.equal(mapDetailStatus(null), 'waiting');
  assert.equal(mapDetailStatus({ inbox: { status: 'email_received' } }), 'email_received');
  assert.equal(statusLabel('email_received'), 'Email received');
  assert.equal(statusTone('email_received'), 'success');
  assert.equal(statusTone('waiting'), 'warning');
});

test('role and sharing helpers handle backend booleans and integers', () => {
  assert.equal(roleTone('owner'), 'success');
  assert.equal(roleTone('member'), 'active');
  assert.equal(roleTone('viewer'), 'warning');
  assert.equal(isWorkspaceShared({ sharedWithWorkspace: true }), true);
  assert.equal(isWorkspaceShared({ sharedWithWorkspace: 1 }), true);
  assert.equal(isWorkspaceShared({ sharedWithWorkspace: false }), false);
  assert.equal(scopeLabel({ sharedWithWorkspace: 1 }), 'Shared');
});

test('settings tabs include activity and stable metadata', () => {
  const tabs = buildSettingsTabs({
    bulkCount: 7,
    workspaceName: 'QA Team',
    inviteCount: 2,
    memberCount: 4,
    activeSessionCount: 3,
    generated24h: 9,
    activityCount: 12,
  });

  assert.deepEqual(tabs.map((tab) => tab.key), ['defaults', 'workspace', 'invites', 'team', 'security', 'analytics', 'activity']);
  assert.equal(tabs.find((tab) => tab.key === 'defaults')?.meta, '7 bulk');
  assert.equal(tabs.find((tab) => tab.key === 'workspace')?.meta, 'QA Team');
  assert.equal(tabs.find((tab) => tab.key === 'activity')?.meta, '12 events');
  assert.equal(balanceStatusLabel('has_balance'), 'Has balance');
});
