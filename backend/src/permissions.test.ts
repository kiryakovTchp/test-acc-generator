import test from 'node:test';
import assert from 'node:assert/strict';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { hashPassword } from './auth.js';

process.env.NODE_ENV = 'test';
const app = (await import('./index.js')).default;

test('viewer workspace role can read but cannot generate or change workspace settings', async () => {
  const password = 'viewer-password-123';
  const userId = createTestUser('viewer_permissions', password);
  const workspaceId = getDefaultWorkspaceForUser(userId);
  db.prepare(`
    UPDATE workspace_members
    SET role = 'viewer'
    WHERE workspace_id = ? AND user_id = ?
  `).run(workspaceId, userId);

  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    const login = await requestJson<{ token: string }>(baseUrl, '/auth/login', {
      method: 'POST',
      body: { login: getLogin(userId), password },
    });
    const headers = { Authorization: `Bearer ${login.token}` };

    const history = await requestJson<{ items: unknown[] }>(baseUrl, '/history', { headers });
    assert.ok(Array.isArray(history.items));

    const userSettings = await requestJson<{ settings: unknown }>(baseUrl, '/user/settings', { headers });
    assert.ok(userSettings.settings);

    const generate = await rawRequest(baseUrl, '/accounts/generate', {
      method: 'POST',
      headers,
      body: { geoKey: 'zambia', documentType: 'passport', role: 'user', persona: 'standard_user' },
    });
    assert.equal(generate.status, 403);
    assert.equal((await generate.json()).code, 'workspace_permission_denied');

    const workspaceSettings = await rawRequest(baseUrl, `/workspaces/${workspaceId}/settings`, {
      method: 'PATCH',
      headers,
      body: { historyLimit: 10 },
    });
    assert.equal(workspaceSettings.status, 403);
    assert.equal((await workspaceSettings.json()).code, 'workspace_settings_forbidden');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}) {
  const response = await rawRequest(baseUrl, path, options);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
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

function createTestUser(prefix: string, password: string) {
  const login = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}
