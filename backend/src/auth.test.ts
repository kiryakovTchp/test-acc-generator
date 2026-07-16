import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from './auth.js';
import db from './db.js';

const require = createRequire(import.meta.url);
const tsxLoaderPath = require.resolve('tsx');

test('password hashing verifies the original password and rejects another one', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt:v1:/);
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
  assert.equal(verifyPassword('wrong password', hash), false);
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
    const result = runDbImport(cwd, { NODE_ENV: 'production', SEED_USERS_JSON: '' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /SEED_USERS_JSON is required in production/);
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

function runDbImport(cwd: string, env: Record<string, string>, script?: string) {
  return spawnSync(process.execPath, ['--import', tsxLoaderPath, '-e', script ?? `await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)});`], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}
