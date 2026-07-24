import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { hashPassword, hashPasswordAsync, hashSessionToken, newSessionToken, verifyPassword, verifyPasswordAsync } from './auth.js';
import db from './db.js';

const require = createRequire(import.meta.url);
const tsxLoaderPath = require.resolve('tsx');
const testDataEncryptionKey = 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

test('password hashing verifies the original password and rejects another one', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt:v1:/);
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
  assert.equal(verifyPassword('wrong password', hash), false);
});

test('async password hashing verifies without the synchronous request path', async () => {
  const hash = await hashPasswordAsync('async correct horse battery staple');
  assert.match(hash, /^scrypt:v1:/);
  assert.equal(await verifyPasswordAsync('async correct horse battery staple', hash), true);
  assert.equal(await verifyPasswordAsync('wrong password', hash), false);
});

test('seed users are stored with password hashes instead of plaintext passwords', () => {
  const row = db.prepare('SELECT password, password_hash FROM users WHERE id = ?').get(1) as { password: string; password_hash: string } | undefined;
  assert.equal(row?.password, '');
  assert.match(row?.password_hash ?? '', /^scrypt:v1:/);
});

test('session token hashes are stable but do not expose the token', () => {
  const token = newSessionToken();
  const hash = hashSessionToken(token);
  assert.equal(hash, hashSessionToken(token));
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
});

test('production startup requires explicit seed users', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'tag-prod-seed-'));
  try {
    const result = runDbImport(cwd, { NODE_ENV: 'production', SEED_USERS_JSON: '', DATA_ENCRYPTION_KEY: testDataEncryptionKey });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /SEED_USERS_JSON is required in production/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('production startup requires data encryption key', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'tag-prod-encryption-'));
  const seed = JSON.stringify([{ login: 'admin', password: 'first-password-123', role: 'admin' }]);
  try {
    const result = runDbImport(cwd, { NODE_ENV: 'production', SEED_USERS_JSON: seed, DATA_ENCRYPTION_KEY: '' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /DATA_ENCRYPTION_KEY is required in production/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('seed bootstrap does not reset existing user password hashes', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'tag-seed-reset-'));
  const seed = JSON.stringify([{ login: 'admin', password: 'first-password-123', role: 'admin' }]);
  try {
    const first = runDbImport(cwd, { SEED_USERS_JSON: seed }, `
      const db = (await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)})).default;
      db.prepare("UPDATE users SET password_hash = 'custom-password-hash', password = '' WHERE login = 'admin'").run();
    `);
    assert.equal(first.status, 0, first.stderr);

    const second = runDbImport(cwd, { SEED_USERS_JSON: seed }, `
      const db = (await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)})).default;
      const row = db.prepare("SELECT password_hash FROM users WHERE login = 'admin'").get();
      if (row.password_hash !== 'custom-password-hash') {
        throw new Error('password hash was reset');
      }
    `);
    assert.equal(second.status, 0, second.stderr);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('startup migrates plaintext sensitive account history when encryption key is configured', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'tag-sensitive-migration-'));
  try {
    const first = runDbImport(cwd, {}, `
      const db = (await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)})).default;
      db.prepare(\`
        INSERT INTO account_history (
          user_id, workspace_id, created_by_user_id, geo_key, geo_label, email, email_password, username,
          account_role, document_type, document_value, document_quality, registration_url,
          inbox_plain_text, inbox_links_json, inbox_codes_json, inbox_html
        ) VALUES (1, 1, 1, 'zambia', 'Zambia', 'plain@example.test', 'plain-password', 'plain_user',
          'user', 'passport', 'A123', 'synthetic_pattern', '',
          'Code 123456', '[{"url":"https://example.com"}]', '["123456"]', '<b>Code</b>')
      \`).run();
    `);
    assert.equal(first.status, 0, first.stderr);

    const second = runDbImport(cwd, { DATA_ENCRYPTION_KEY: testDataEncryptionKey }, `
      const db = (await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)})).default;
      const row = db.prepare('SELECT email_password, inbox_plain_text, inbox_links_json, inbox_codes_json, inbox_html FROM account_history WHERE email = ?').get('plain@example.test');
      for (const field of ['email_password', 'inbox_plain_text', 'inbox_links_json', 'inbox_codes_json', 'inbox_html']) {
        if (!String(row[field]).startsWith('enc:v1:')) {
          throw new Error(field + ' was not encrypted');
        }
      }
    `);
    assert.equal(second.status, 0, second.stderr);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function runDbImport(cwd: string, env: Record<string, string>, script?: string) {
  return spawnSync(process.execPath, ['--import', tsxLoaderPath, '-e', script ?? `await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)});`], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}
