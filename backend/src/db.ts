import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Role, DocumentQuality, Gender, PersonaKey, AccountBalanceStatus } from './types.js';
import { hashPassword } from './auth.js';

const dataDir = path.resolve(process.cwd(), 'backend', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','user')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS account_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  geo_key TEXT NOT NULL,
  geo_label TEXT NOT NULL,
  email TEXT NOT NULL,
  email_password TEXT NOT NULL,
  username TEXT NOT NULL,
  site_account_id TEXT NOT NULL DEFAULT '',
  balance_status TEXT NOT NULL DEFAULT 'unknown',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 0,
  gender TEXT NOT NULL DEFAULT 'male',
  date_of_birth TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'Not specified',
  city TEXT NOT NULL DEFAULT '',
  place_of_birth TEXT NOT NULL DEFAULT '',
  address_line TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL DEFAULT 'standard_user',
  account_role TEXT NOT NULL CHECK(account_role IN ('admin','user')),
  document_type TEXT NOT NULL,
  document_value TEXT NOT NULL,
  document_issue_date TEXT NOT NULL DEFAULT '',
  document_quality TEXT NOT NULL CHECK(document_quality IN ('verified','synthetic_pattern','missing_rules')),
  registration_url TEXT NOT NULL,
  inbox_status TEXT NOT NULL DEFAULT 'no_email_found',
  inbox_sender TEXT NOT NULL DEFAULT '',
  inbox_subject TEXT NOT NULL DEFAULT '',
  inbox_received_at TEXT NOT NULL DEFAULT '',
  inbox_plain_text TEXT,
  inbox_links_json TEXT NOT NULL DEFAULT '[]',
  inbox_codes_json TEXT NOT NULL DEFAULT '[]',
  inbox_html TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_account_history_user_created_at ON account_history(user_id, created_at DESC);
`);

ensureColumn('users', 'email', 'TEXT');
ensureColumn('users', 'username', 'TEXT');
ensureColumn('users', 'password_hash', 'TEXT');
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users', 'updated_at', 'TEXT');

ensureColumn('account_history', 'first_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'workspace_id', 'INTEGER');
ensureColumn('account_history', 'created_by_user_id', 'INTEGER');
ensureColumn('account_history', 'shared_with_workspace', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('account_history', 'shared_at', 'TEXT');
ensureColumn('account_history', 'site_account_id', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'balance_status', "TEXT NOT NULL DEFAULT 'unknown'");
ensureColumn('account_history', 'last_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'phone', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'age', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('account_history', 'gender', "TEXT NOT NULL DEFAULT 'male'");
ensureColumn('account_history', 'date_of_birth', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'country', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'region', "TEXT NOT NULL DEFAULT 'Not specified'");
ensureColumn('account_history', 'city', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'place_of_birth', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'address_line', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'postal_code', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'persona', "TEXT NOT NULL DEFAULT 'standard_user'");
ensureColumn('account_history', 'document_issue_date', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'inbox_status', "TEXT NOT NULL DEFAULT 'no_email_found'");
ensureColumn('account_history', 'inbox_sender', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'inbox_subject', "TEXT NOT NULL DEFAULT ''");
ensureColumn('account_history', 'inbox_received_at', "TEXT NOT NULL DEFAULT ''");

db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND email != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username) WHERE username IS NOT NULL AND username != '';

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  default_geo TEXT,
  default_persona TEXT,
  default_document_type TEXT,
  bulk_count INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id INTEGER PRIMARY KEY,
  history_retention_days INTEGER NOT NULL DEFAULT 30,
  history_limit INTEGER NOT NULL DEFAULT 50,
  allow_bulk_generation INTEGER NOT NULL DEFAULT 1,
  max_bulk_count INTEGER NOT NULL DEFAULT 25,
  mailbox_provider TEXT NOT NULL DEFAULT 'mail_tm',
  accounts_per_day INTEGER NOT NULL DEFAULT 25,
  mailbox_create_per_day INTEGER NOT NULL DEFAULT 25,
  inbox_refresh_per_minute INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  invited_by_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked','expired')),
  expires_at TEXT NOT NULL,
  accepted_by_user_id INTEGER,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id),
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_account_history_workspace_created_at ON account_history(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_history_created_by ON account_history(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_history_workspace_shared ON account_history(workspace_id, shared_with_workspace, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_workspace_type_created_at ON usage_events(workspace_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash_unique ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_created_at ON workspace_invites(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_status_expires_at ON workspace_invites(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_created_at ON activity_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_type ON activity_events(workspace_id, event_type, created_at DESC);
`);

ensureColumn('sessions', 'last_seen_at', 'TEXT');
ensureColumn('workspaces', 'status', "TEXT NOT NULL DEFAULT 'active'");

const seedUsers = loadSeedUsers();
for (const user of seedUsers) {
  db.prepare(`
    INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
    VALUES (?, '', ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    ON CONFLICT(login) DO UPDATE SET
      password = '',
      password_hash = excluded.password_hash,
      role = excluded.role,
      email = COALESCE(NULLIF(users.email, ''), excluded.email),
      username = COALESCE(NULLIF(users.username, ''), excluded.username),
      status = COALESCE(NULLIF(users.status, ''), 'active'),
      updated_at = CURRENT_TIMESTAMP
  `).run(user.login, hashPassword(user.password), user.role, user.login, user.login);
}

backfillUserWorkspaceFoundation();

function loadSeedUsers() {
  const raw = process.env.SEED_USERS_JSON;
  if (!raw) {
    return [
      { login: 'admin', password: 'admin123', role: 'admin' as const },
      { login: 'demo', password: 'demo123', role: 'user' as const },
    ];
  }

  const parsed = JSON.parse(raw) as Array<{ login: string; password: string; role: Role }>;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('SEED_USERS_JSON must be a non-empty JSON array');
  }

  for (const user of parsed) {
    if (!user?.login || !user?.password || !['admin', 'user'].includes(user.role)) {
      throw new Error('SEED_USERS_JSON contains an invalid user entry');
    }
  }

  return parsed;
}

export interface UserRow {
  id: number;
  login: string;
  password: string;
  role: Role;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
export interface HistoryRow {
  id: number;
  user_id: number;
  workspace_id: number | null;
  created_by_user_id: number | null;
  geo_key: string;
  geo_label: string;
  email: string;
  email_password: string;
  username: string;
  site_account_id: string;
  balance_status: AccountBalanceStatus;
  first_name: string;
  last_name: string;
  phone: string;
  age: number;
  gender: Gender;
  date_of_birth: string;
  country: string;
  region: string;
  city: string;
  place_of_birth: string;
  address_line: string;
  postal_code: string;
  persona: PersonaKey;
  account_role: Role;
  document_type: string;
  document_value: string;
  document_issue_date: string;
  document_quality: DocumentQuality;
  registration_url: string;
  inbox_status: 'waiting_for_email' | 'email_received' | 'no_email_found';
  inbox_sender: string;
  inbox_subject: string;
  inbox_received_at: string;
  inbox_plain_text: string | null;
  inbox_links_json: string;
  inbox_codes_json: string;
  inbox_html: string | null;
  created_at: string;
}

export interface WorkspaceRow {
  id: number;
  owner_user_id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export function getDefaultWorkspaceForUser(userId: number): number {
  const workspace = db.prepare(`
    SELECT w.id
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
      AND w.status = 'active'
    ORDER BY
      CASE WHEN w.owner_user_id = ? THEN 0 ELSE 1 END,
      w.id ASC
    LIMIT 1
  `).get(userId, userId) as { id: number } | undefined;
  if (workspace) return workspace.id;

  createDefaultWorkspaceForUser(userId);
  const created = db.prepare(`
    SELECT w.id
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
      AND w.status = 'active'
    ORDER BY w.id ASC
    LIMIT 1
  `).get(userId) as { id: number } | undefined;
  if (!created) {
    throw new Error(`Unable to resolve workspace for user ${userId}`);
  }
  return created.id;
}

export function assertWorkspaceAccess(userId: number, workspaceId: number): number {
  const membership = db.prepare(`
    SELECT wm.workspace_id
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.workspace_id = ? AND w.status = 'active'
    LIMIT 1
  `).get(userId, workspaceId) as { workspace_id: number } | undefined;
  if (!membership) {
    throw new Error('Workspace access denied');
  }
  return membership.workspace_id;
}

export default db;

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function backfillUserWorkspaceFoundation() {
  const legacyUsers = db.prepare(`
    SELECT id, password
    FROM users
    WHERE (password_hash IS NULL OR password_hash = '') AND password IS NOT NULL AND password != ''
  `).all() as Array<{ id: number; password: string }>;

  const passwordTx = db.transaction(() => {
    for (const user of legacyUsers) {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, password = '', updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `).run(hashPassword(user.password), user.id);
    }
  });
  passwordTx();

  db.prepare(`
    UPDATE users
    SET email = COALESCE(NULLIF(email, ''), login),
        username = COALESCE(NULLIF(username, ''), login),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
    WHERE email IS NULL OR email = '' OR username IS NULL OR username = '' OR updated_at IS NULL OR updated_at = ''
  `).run();

  const users = db.prepare('SELECT id FROM users ORDER BY id ASC').all() as Array<{ id: number }>;
  const tx = db.transaction(() => {
    for (const user of users) {
      const workspaceId = createDefaultWorkspaceForUser(user.id);
      db.prepare(`
        UPDATE account_history
        SET workspace_id = COALESCE(workspace_id, ?),
            created_by_user_id = COALESCE(created_by_user_id, user_id)
        WHERE user_id = ?
      `).run(workspaceId, user.id);
    }
  });
  tx();
}

function createDefaultWorkspaceForUser(userId: number): number {
  const existing = db.prepare(`
    SELECT id
    FROM workspaces
    WHERE owner_user_id = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(userId) as { id: number } | undefined;

  const workspaceId = existing?.id ?? Number(db.prepare(`
    INSERT INTO workspaces (owner_user_id, name)
    VALUES (?, ?)
  `).run(userId, 'Default workspace').lastInsertRowid);

  db.prepare(`
    INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role)
    VALUES (?, ?, 'owner')
  `).run(workspaceId, userId);

  db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id)
    VALUES (?)
  `).run(userId);

  db.prepare(`
    INSERT OR IGNORE INTO workspace_settings (workspace_id)
    VALUES (?)
  `).run(workspaceId);

  return workspaceId;
}
