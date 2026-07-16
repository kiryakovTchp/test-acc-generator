import test from 'node:test';
import assert from 'node:assert/strict';
import db from './db.js';
import { listActivityEvents, recordActivity } from './activity.js';

test('activity events are recorded with actor and parsed metadata', () => {
  const userId = createTestUser('activity_owner');
  const workspaceId = createWorkspaceForUser(userId, 'Activity QA');

  recordActivity({
    workspaceId,
    userId,
    eventType: 'account_generated',
    entityType: 'account',
    entityId: 42,
    summary: 'Generated test user',
    metadata: { geoKey: 'zambia' },
  });

  const events = listActivityEvents(workspaceId, userId);
  const event = events.find((item) => item.eventType === 'account_generated' && item.entityId === '42');

  assert.ok(event);
  assert.equal(event?.actorLogin.startsWith('activity_owner_'), true);
  assert.equal(event?.summary, 'Generated test user');
  assert.deepEqual(event?.metadata, { geoKey: 'zambia' });
});

test('workspace viewers can read activity but outsiders cannot', () => {
  const ownerId = createTestUser('activity_owner_read');
  const viewerId = createTestUser('activity_viewer');
  const outsiderId = createTestUser('activity_outsider');
  const workspaceId = createWorkspaceForUser(ownerId, 'Activity Read QA');
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, viewerId, 'viewer');

  recordActivity({
    workspaceId,
    userId: ownerId,
    eventType: 'workspace_created',
    entityType: 'workspace',
    entityId: workspaceId,
    summary: 'Created workspace',
  });

  assert.equal(listActivityEvents(workspaceId, viewerId).length > 0, true);
  assert.throws(() => listActivityEvents(workspaceId, outsiderId), /Workspace access denied/);
});

function createTestUser(prefix: string) {
  const login = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const result = db.prepare(`
    INSERT INTO users (login, password, role, email, username, status, updated_at)
    VALUES (?, '', 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}

function createWorkspaceForUser(userId: number, name: string) {
  const result = db.prepare(`
    INSERT INTO workspaces (owner_user_id, name, status)
    VALUES (?, ?, 'active')
  `).run(userId, name);
  const workspaceId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, userId, 'owner');
  db.prepare('INSERT OR IGNORE INTO workspace_settings (workspace_id) VALUES (?)').run(workspaceId);
  return workspaceId;
}
