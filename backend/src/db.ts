import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Role, DocumentQuality, Gender, PersonaKey } from './types.js';

const dataDir = path.resolve(process.cwd(), 'backend', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

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

ensureColumn('account_history', 'first_name', "TEXT NOT NULL DEFAULT ''");
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

const seedUsers = loadSeedUsers();
for (const user of seedUsers) {
  db.prepare(`
    INSERT INTO users (login, password, role)
    VALUES (?, ?, ?)
    ON CONFLICT(login) DO UPDATE SET password = excluded.password, role = excluded.role
  `).run(user.login, user.password, user.role);
}

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

export interface UserRow { id: number; login: string; password: string; role: Role; }
export interface HistoryRow {
  id: number;
  user_id: number;
  geo_key: string;
  geo_label: string;
  email: string;
  email_password: string;
  username: string;
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

export default db;

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
