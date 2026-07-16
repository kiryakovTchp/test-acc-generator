import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { ApiError } from './limits.js';
import { addWorkspaceMember, listWorkspaceMembers, removeWorkspaceMember, updateWorkspaceMemberRole } from './workspaceMembers.js';

test('owner can add update and remove workspace members', () => {
  const ownerId = createTestUser('members_owner');
  const memberId = createTestUser('members_target');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  const memberLogin = getLogin(memberId);

  let members = addWorkspaceMember(workspaceId, ownerId, { login: memberLogin, role: 'member' });
  assert.ok(members.some((item) => item.userId === memberId && item.workspaceRole === 'member'));

  members = updateWorkspaceMemberRole(workspaceId, ownerId, memberId, { role: 'viewer' });
  assert.ok(members.some((item) => item.userId === memberId && item.workspaceRole === 'viewer'));

  members = removeWorkspaceMember(workspaceId, ownerId, memberId);
  assert.equal(members.some((item) => item.userId === memberId), false);
});

test('plain member cannot manage workspace members', () => {
  const ownerId = createTestUser('members_owner_forbidden');
  const memberId = createTestUser('members_forbidden');
  const targetId = createTestUser('members_target_forbidden');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  addWorkspaceMember(workspaceId, ownerId, { login: getLogin(memberId), role: 'member' });

  assert.throws(
    () => addWorkspaceMember(workspaceId, memberId, { login: getLogin(targetId), role: 'viewer' }),
    (error) => error instanceof ApiError && error.code === 'workspace_members_forbidden',
  );
});

test('workspace must keep at least one owner', () => {
  const ownerId = createTestUser('members_last_owner');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);

  assert.throws(
    () => updateWorkspaceMemberRole(workspaceId, ownerId, ownerId, { role: 'admin' }),
    (error) => error instanceof ApiError && error.code === 'last_owner_required',
  );

  assert.throws(
    () => removeWorkspaceMember(workspaceId, ownerId, ownerId),
    (error) => error instanceof ApiError && error.code === 'last_owner_required',
  );

  assert.equal(listWorkspaceMembers(workspaceId, ownerId).some((item) => item.userId === ownerId && item.workspaceRole === 'owner'), true);
});

test('workspace admin cannot take over owner role or mutate owners', () => {
  const ownerId = createTestUser('members_takeover_owner');
  const adminId = createTestUser('members_takeover_admin');
  const targetId = createTestUser('members_takeover_target');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);

  addWorkspaceMember(workspaceId, ownerId, { login: getLogin(adminId), role: 'admin' });
  addWorkspaceMember(workspaceId, ownerId, { login: getLogin(targetId), role: 'member' });

  assert.throws(
    () => updateWorkspaceMemberRole(workspaceId, adminId, adminId, { role: 'owner' }),
    (error) => error instanceof ApiError && error.code === 'owner_role_required',
  );
  assert.throws(
    () => updateWorkspaceMemberRole(workspaceId, adminId, targetId, { role: 'owner' }),
    (error) => error instanceof ApiError && error.code === 'owner_role_required',
  );
  assert.throws(
    () => updateWorkspaceMemberRole(workspaceId, adminId, ownerId, { role: 'member' }),
    (error) => error instanceof ApiError && error.code === 'owner_role_required',
  );
  assert.throws(
    () => removeWorkspaceMember(workspaceId, adminId, ownerId),
    (error) => error instanceof ApiError && error.code === 'owner_role_required',
  );
});

test('workspace owner can grant owner role when another owner remains', () => {
  const ownerId = createTestUser('members_grant_owner');
  const targetId = createTestUser('members_new_owner');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);

  addWorkspaceMember(workspaceId, ownerId, { login: getLogin(targetId), role: 'admin' });
  const members = updateWorkspaceMemberRole(workspaceId, ownerId, targetId, { role: 'owner' });

  assert.equal(members.some((item) => item.userId === targetId && item.workspaceRole === 'owner'), true);
});

function createTestUser(prefix: string) {
  const login = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const result = db.prepare(`
    INSERT INTO users (login, password, role, email, username, status, updated_at)
    VALUES (?, '', 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}

function getLogin(userId: number) {
  const row = db.prepare('SELECT login FROM users WHERE id = ?').get(userId) as { login: string };
  return row.login;
}
