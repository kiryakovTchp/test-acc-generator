import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { hashPassword } from './auth.js';
import { ApiError } from './limits.js';
import { createWorkspaceInvite, listWorkspaceInvites, registerUserWithInvite, revokeWorkspaceInvite } from './invitations.js';
import { listWorkspaceMembers } from './workspaceMembers.js';

test('owner can create invite and register a user into the workspace', () => {
  const ownerId = createTestUser('invite_owner');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  const email = uniqueEmail('new-user');
  const invite = createWorkspaceInvite(workspaceId, ownerId, { email, role: 'viewer', expiresInDays: 3 });

  assert.equal(invite.role, 'viewer');
  assert.equal(invite.email, email);
  assert.ok(invite.token.length > 20);

  const user = registerUserWithInvite({
    inviteToken: invite.token,
    email,
    username: uniqueLogin('invited_user'),
    passwordHash: hashPassword('password123'),
  });

  const members = listWorkspaceMembers(workspaceId, ownerId);
  assert.ok(members.some((item) => item.userId === user.id && item.workspaceRole === 'viewer'));

  const invites = listWorkspaceInvites(workspaceId, ownerId);
  assert.ok(invites.some((item) => item.id === invite.id && item.status === 'accepted' && item.acceptedByLogin === user.login));
});

test('invite registration rejects email mismatch and token reuse', () => {
  const ownerId = createTestUser('invite_owner_mismatch');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  const email = uniqueEmail('expected');
  const invite = createWorkspaceInvite(workspaceId, ownerId, { email, role: 'member' });

  assert.throws(
    () => registerUserWithInvite({
      inviteToken: invite.token,
      email: uniqueEmail('other'),
      username: uniqueLogin('bad_invited_user'),
      passwordHash: hashPassword('password123'),
    }),
    (error) => error instanceof ApiError && error.code === 'invite_email_mismatch',
  );

  registerUserWithInvite({
    inviteToken: invite.token,
    email,
    username: uniqueLogin('good_invited_user'),
    passwordHash: hashPassword('password123'),
  });

  assert.throws(
    () => registerUserWithInvite({
      inviteToken: invite.token,
      email,
      username: uniqueLogin('reused_invited_user'),
      passwordHash: hashPassword('password123'),
    }),
    (error) => error instanceof ApiError && error.code === 'invite_invalid',
  );
});

test('plain member cannot create or revoke workspace invites', () => {
  const ownerId = createTestUser('invite_owner_forbidden');
  const memberId = createTestUser('invite_member_forbidden');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(workspaceId, memberId, 'member');
  const invite = createWorkspaceInvite(workspaceId, ownerId, { role: 'member' });

  assert.throws(
    () => createWorkspaceInvite(workspaceId, memberId, { role: 'viewer' }),
    (error) => error instanceof ApiError && error.code === 'workspace_invites_forbidden',
  );
  assert.throws(
    () => revokeWorkspaceInvite(workspaceId, memberId, invite.id),
    (error) => error instanceof ApiError && error.code === 'workspace_invites_forbidden',
  );
});

test('owner can revoke a pending invite', () => {
  const ownerId = createTestUser('invite_owner_revoke');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  const invite = createWorkspaceInvite(workspaceId, ownerId, { role: 'admin' });
  const invites = revokeWorkspaceInvite(workspaceId, ownerId, invite.id);

  assert.ok(invites.some((item) => item.id === invite.id && item.status === 'revoked'));
  assert.throws(
    () => registerUserWithInvite({
      inviteToken: invite.token,
      email: 'revoked@example.test',
      username: uniqueLogin('revoked_user'),
      passwordHash: hashPassword('password123'),
    }),
    (error) => error instanceof ApiError && error.code === 'invite_invalid',
  );
});

function createTestUser(prefix: string) {
  const login = uniqueLogin(prefix);
  const result = db.prepare(`
    INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
    VALUES (?, '', ?, 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, hashPassword('password123'), `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}

function uniqueLogin(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function uniqueEmail(prefix: string) {
  return `${uniqueLogin(prefix)}@example.test`;
}
