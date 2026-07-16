import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { ApiError, reserveUsageBatch, USAGE_EVENTS } from './limits.js';

test('usage reservation records attempts before external work', () => {
  const userId = createUsageUser('usage_reservation');
  const workspaceId = getDefaultWorkspaceForUser(userId);

  reserveUsageBatch(workspaceId, userId, [
    { eventType: USAGE_EVENTS.accountGenerated, limit: 5, window: '-1 day', code: 'account_limit', message: 'Account limit', quantity: 2 },
    { eventType: USAGE_EVENTS.mailboxCreated, limit: 5, window: '-1 day', code: 'mailbox_limit', message: 'Mailbox limit', quantity: 2 },
  ]);

  const rows = db.prepare(`
    SELECT event_type AS eventType, quantity
    FROM usage_events
    WHERE workspace_id = ? AND user_id = ?
    ORDER BY event_type
  `).all(workspaceId, userId) as Array<{ eventType: string; quantity: number }>;

  assert.deepEqual(rows, [
    { eventType: USAGE_EVENTS.accountGenerated, quantity: 2 },
    { eventType: USAGE_EVENTS.mailboxCreated, quantity: 2 },
  ]);
});

test('usage reservation batch is atomic when one limit would be exceeded', () => {
  const userId = createUsageUser('usage_atomic');
  const workspaceId = getDefaultWorkspaceForUser(userId);

  assert.throws(
    () => reserveUsageBatch(workspaceId, userId, [
      { eventType: USAGE_EVENTS.accountGenerated, limit: 5, window: '-1 day', code: 'account_limit', message: 'Account limit', quantity: 1 },
      { eventType: USAGE_EVENTS.mailboxCreated, limit: 0, window: '-1 day', code: 'mailbox_limit', message: 'Mailbox limit', quantity: 1 },
    ]),
    (error) => error instanceof ApiError && error.code === 'mailbox_limit',
  );

  const count = db.prepare(`
    SELECT COUNT(*) AS count
    FROM usage_events
    WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { count: number };

  assert.equal(count.count, 0);
});

function createUsageUser(prefix: string) {
  const login = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const result = db.prepare(`
    INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
    VALUES (?, '', 'test-password-hash', 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}
