import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { getWorkspaceAlerts, getWorkspaceAnalytics } from './monitoring.js';

test('workspace alerts flag near limits and review documents', () => {
  const userId = createTestUser('monitoring_alerts');
  const workspaceId = getDefaultWorkspaceForUser(userId);
  db.prepare('UPDATE workspace_settings SET accounts_per_day = 10 WHERE workspace_id = ?').run(workspaceId);
  db.prepare(`
    INSERT INTO usage_events (workspace_id, user_id, event_type, quantity)
    VALUES (?, ?, 'account_generated', 8)
  `).run(workspaceId, userId);
  insertHistory(workspaceId, userId, 'gabon', 'Gabon', 'synthetic_pattern');

  const alerts = getWorkspaceAlerts(workspaceId, userId);
  assert.ok(alerts.some((item) => item.id === 'accounts-limit-warning' && item.tone === 'warning'));
  assert.ok(alerts.some((item) => item.id === 'dataset-review-24h' && item.tone === 'info'));
});

test('workspace analytics summarizes usage and generated geo data', () => {
  const userId = createTestUser('monitoring_analytics');
  const workspaceId = getDefaultWorkspaceForUser(userId);
  db.prepare(`
    INSERT INTO usage_events (workspace_id, user_id, event_type, quantity)
    VALUES (?, ?, 'account_generated', 2),
           (?, ?, 'mailbox_created', 2)
  `).run(workspaceId, userId, workspaceId, userId);
  insertHistory(workspaceId, userId, 'nigeria', 'Nigeria', 'verified', 'email_received');
  insertHistory(workspaceId, userId, 'gabon', 'Gabon', 'synthetic_pattern');

  const summary = getWorkspaceAnalytics(workspaceId, userId);
  assert.equal(summary.totals.generatedTotal, 2);
  assert.equal(summary.totals.generated24h, 2);
  assert.equal(summary.totals.emailReceived, 1);
  assert.equal(summary.totals.verifiedDocuments, 1);
  assert.equal(summary.totals.reviewDocuments, 1);
  assert.ok(summary.usageByDay.some((item) => item.eventType === 'account_generated' && item.total === 2));
  assert.ok(summary.topGeos.some((item) => item.geoKey === 'nigeria' && item.count === 1));
});

function createTestUser(prefix: string) {
  const login = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const result = db.prepare(`
    INSERT INTO users (login, password, role, email, username, status, updated_at)
    VALUES (?, '', 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}

function insertHistory(
  workspaceId: number,
  userId: number,
  geoKey: string,
  geoLabel: string,
  documentQuality: 'verified' | 'synthetic_pattern',
  inboxStatus = 'no_email_found',
) {
  db.prepare(`
    INSERT INTO account_history (
      user_id, workspace_id, created_by_user_id, geo_key, geo_label, email, email_password, username,
      account_role, document_type, document_value, document_quality, registration_url, inbox_status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'secret', ?, 'user', 'passport', 'ABC123', ?, 'https://example.test', ?)
  `).run(userId, workspaceId, userId, geoKey, geoLabel, `${geoKey}-${Date.now()}@example.test`, `${geoKey}_${userId}`, documentQuality, inboxStatus);
}
