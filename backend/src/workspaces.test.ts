import test from 'node:test';
import assert from 'node:assert/strict';
import db from './db.js';
import { createWorkspace, listWorkspaces, updateWorkspaceStatus } from './workspaces.js';

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

test('owners can archive and restore an extra workspace', () => {
  const userId = createTestUser('workspace_archive');
  const defaultWorkspace = createWorkspace(userId, { name: 'Default QA' });
  const archiveTarget = createWorkspace(userId, { name: 'Old Launch' });

  const archived = updateWorkspaceStatus(userId, archiveTarget.id, { status: 'archived' });
  assert.equal(archived.status, 'archived');
  assert.throws(
    () => updateWorkspaceStatus(userId, defaultWorkspace.id, { status: 'archived' }),
    /At least one active workspace is required/,
  );

  const listed = listWorkspaces(userId);
  assert.equal(listed.find((item) => item.id === archiveTarget.id)?.status, 'archived');
  assert.equal(listed.at(-1)?.id, archiveTarget.id);

  const restored = updateWorkspaceStatus(userId, archiveTarget.id, { status: 'active' });
  assert.equal(restored.status, 'active');
});

test('non-owners cannot archive workspaces', () => {
  const ownerId = createTestUser('workspace_owner');
  const memberId = createTestUser('workspace_member');
  const workspace = createWorkspace(ownerId, { name: 'Owned workspace' });

  db.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (?, ?, 'admin')
  `).run(workspace.id, memberId);

  assert.throws(
    () => updateWorkspaceStatus(memberId, workspace.id, { status: 'archived' }),
    /Only workspace owners can archive or restore workspaces/,
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
