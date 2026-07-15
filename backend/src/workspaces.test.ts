import test from 'node:test';
import assert from 'node:assert/strict';
import db from './db.js';
import { createWorkspace, listWorkspaces } from './workspaces.js';

test('active users can create and list additional workspaces', () => {
  const userId = createTestUser('workspace_create');
  const workspace = createWorkspace(userId, { name: '  Payments QA  ' });

  assert.equal(workspace.name, 'Payments QA');
  assert.equal(workspace.status, 'active');
  assert.equal(workspace.workspaceRole, 'owner');

  const workspaces = listWorkspaces(userId);
  assert.ok(workspaces.some((item) => item.id === workspace.id && item.memberCount === 1));
});

test('inactive users cannot create workspaces', () => {
  const userId = createTestUser('workspace_inactive');
  db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(userId);

  assert.throws(
    () => createWorkspace(userId, { name: 'Blocked' }),
    /Only active users can create workspaces/,
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
