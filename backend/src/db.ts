import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Role, DocumentQuality } from './types.js';

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
  account_role TEXT NOT NULL CHECK(account_role IN ('admin','user')),
  document_type TEXT NOT NULL,
  document_value TEXT NOT NULL,
  document_quality TEXT NOT NULL CHECK(document_quality IN ('verified','synthetic_pattern','missing_rules')),
  registration_url TEXT NOT NULL,
  inbox_plain_text TEXT,
  inbox_links_json TEXT NOT NULL DEFAULT '[]',
  inbox_codes_json TEXT NOT NULL DEFAULT '[]',
  inbox_html TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_account_history_user_created_at ON account_history(user_id, created_at DESC);
`);

const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (count.count === 0) {
  const seedUsers = loadSeedUsers();
  const values = seedUsers.map((user) => '(?, ?, ?)').join(', ');
  const params = seedUsers.flatMap((user) => [user.login, user.password, user.role]);
  db.prepare(`INSERT INTO users (login, password, role) VALUES ${values}`).run(...params);
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
  id: number; user_id: number; geo_key: string; geo_label: string; email: string; email_password: string; username: string;
  account_role: Role; document_type: string; document_value: string; document_quality: DocumentQuality; registration_url: string;
  inbox_plain_text: string | null; inbox_links_json: string; inbox_codes_json: string; inbox_html: string | null; created_at: string;
}

export default db;
