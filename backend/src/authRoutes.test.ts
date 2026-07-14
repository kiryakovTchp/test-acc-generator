import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { hashPassword } from './auth.js';
import { createWorkspaceInvite } from './invitations.js';

process.env.NODE_ENV = 'test';
process.env.REGISTRATION_MODE = 'invite_only';
const app = (await import('./index.js')).default;

test('invite can be inspected and accepted through HTTP registration', async () => {
  const ownerId = createTestUser('http_invite_owner', 'owner-password-123');
  const workspaceId = getDefaultWorkspaceForUser(ownerId);
  const email = uniqueEmail('http-invited');
  const invite = createWorkspaceInvite(workspaceId, ownerId, { email, role: 'member' });

  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    const inspected = await requestJson<{ invite: { email: string; role: string; workspaceName: string } }>(baseUrl, `/auth/invite?token=${encodeURIComponent(invite.token)}`);
    assert.equal(inspected.invite.email, email);
    assert.equal(inspected.invite.role, 'member');
    assert.equal(inspected.invite.workspaceName, 'Default workspace');

    const registered = await requestJson<{ token: string; user: { email: string; username: string; workspaceRole: string } }>(baseUrl, '/auth/register', {
      method: 'POST',
      body: {
        inviteToken: invite.token,
        email,
        username: uniqueLogin('http_invited_user'),
        password: 'new-password-123',
      },
    });
    assert.ok(registered.token);
    assert.equal(registered.user.email, email);
    assert.equal(registered.user.workspaceRole, 'member');
  } finally {
    await closeServer(server);
  }
});

test('profile password and session management routes update only the authenticated user', async () => {
  const password = 'profile-password-123';
  const userId = createTestUser('profile_user', password);

  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    const login = await requestJson<{ token: string; user: { username: string } }>(baseUrl, '/auth/login', {
      method: 'POST',
      body: { login: getLogin(userId), password },
    });
    const headers = { Authorization: `Bearer ${login.token}` };

    const profile = await requestJson<{ token: string; user: { login: string; email: string; username: string } }>(baseUrl, '/auth/profile', {
      method: 'PATCH',
      headers,
      body: { email: uniqueEmail('updated-profile'), username: uniqueLogin('updated_profile') },
    });
    assert.equal(profile.user.login, profile.user.username);
    assert.match(profile.user.email, /updated-profile/);

    const sessions = await requestJson<{ sessions: Array<{ id: number; isCurrent: number }> }>(baseUrl, '/auth/sessions', { headers: { Authorization: `Bearer ${profile.token}` } });
    assert.ok(sessions.sessions.some((session) => session.isCurrent === 1));

    const badPassword = await rawRequest(baseUrl, '/auth/password', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${profile.token}` },
      body: { currentPassword: 'wrong-password', newPassword: 'next-password-123' },
    });
    assert.equal(badPassword.status, 403);

    const changed = await rawRequest(baseUrl, '/auth/password', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${profile.token}` },
      body: { currentPassword: password, newPassword: 'next-password-123' },
    });
    assert.equal(changed.status, 204);

    const logoutAll = await rawRequest(baseUrl, '/auth/logout-everywhere', {
      method: 'POST',
      headers: { Authorization: `Bearer ${profile.token}` },
    });
    assert.equal(logoutAll.status, 204);

    const expired = await rawRequest(baseUrl, '/auth/me', { headers: { Authorization: `Bearer ${profile.token}` } });
    assert.equal(expired.status, 401);
  } finally {
    await closeServer(server);
  }
});

async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}) {
  const response = await rawRequest(baseUrl, path, options);
  if (!response.ok) {
    assert.fail(`${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function rawRequest(baseUrl: string, path: string, options: RequestOptions = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function closeServer(server: ReturnType<typeof app.listen>) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function createTestUser(prefix: string, password: string) {
  const login = uniqueLogin(prefix);
  const result = db.prepare(`
    INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
    VALUES (?, '', ?, 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(login, hashPassword(password), `${login}@example.test`, login);
  return Number(result.lastInsertRowid);
}

function getLogin(userId: number) {
  const row = db.prepare('SELECT login FROM users WHERE id = ?').get(userId) as { login: string };
  return row.login;
}

function uniqueLogin(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function uniqueEmail(prefix: string) {
  return `${uniqueLogin(prefix)}@example.test`;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}
