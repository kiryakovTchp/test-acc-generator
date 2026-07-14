import db from './db.js';
import { ApiError } from './limits.js';
import { assertWorkspaceRole } from './permissions.js';
import type { PersonaKey } from './types.js';

const PERSONAS = ['standard_user', 'young_user', 'senior_user', 'male_user', 'female_user'];

export interface UserSettingsResponse {
  defaultGeo: string;
  defaultPersona: PersonaKey;
  defaultDocumentType: string;
  bulkCount: number;
}

export interface WorkspaceSettingsResponse {
  historyRetentionDays: number;
  historyLimit: number;
  allowBulkGeneration: boolean;
  maxBulkCount: number;
  mailboxProvider: string;
  accountsPerDay: number;
  mailboxCreatePerDay: number;
  inboxRefreshPerMinute: number;
}

export function getUserSettings(userId: number): UserSettingsResponse {
  ensureUserSettings(userId);
  const row = db.prepare(`
    SELECT default_geo, default_persona, default_document_type, bulk_count
    FROM user_settings
    WHERE user_id = ?
  `).get(userId) as any;

  return {
    defaultGeo: row.default_geo || 'nigeria',
    defaultPersona: isPersona(row.default_persona) ? row.default_persona : 'standard_user',
    defaultDocumentType: row.default_document_type || 'nin',
    bulkCount: clampInt(row.bulk_count, 1, 100, 5),
  };
}

export function updateUserSettings(userId: number, payload: any): UserSettingsResponse {
  ensureUserSettings(userId);
  const current = getUserSettings(userId);
  const next = {
    defaultGeo: normalizeKey(payload?.defaultGeo, current.defaultGeo, 80),
    defaultPersona: isPersona(payload?.defaultPersona) ? payload.defaultPersona : current.defaultPersona,
    defaultDocumentType: normalizeKey(payload?.defaultDocumentType, current.defaultDocumentType, 80),
    bulkCount: clampInt(payload?.bulkCount, 1, 100, current.bulkCount),
  };

  db.prepare(`
    UPDATE user_settings
    SET default_geo = ?,
        default_persona = ?,
        default_document_type = ?,
        bulk_count = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(next.defaultGeo, next.defaultPersona, next.defaultDocumentType, next.bulkCount, userId);

  return getUserSettings(userId);
}

export function getWorkspaceSettingsForApi(workspaceId: number): WorkspaceSettingsResponse {
  ensureWorkspaceSettings(workspaceId);
  const row = db.prepare(`
    SELECT history_retention_days, history_limit, allow_bulk_generation, max_bulk_count, mailbox_provider,
           accounts_per_day, mailbox_create_per_day, inbox_refresh_per_minute
    FROM workspace_settings
    WHERE workspace_id = ?
  `).get(workspaceId) as any;

  return {
    historyRetentionDays: clampInt(row.history_retention_days, 1, 3650, 30),
    historyLimit: clampInt(row.history_limit, 1, 1000, 50),
    allowBulkGeneration: Boolean(row.allow_bulk_generation),
    maxBulkCount: clampInt(row.max_bulk_count, 1, 100, 25),
    mailboxProvider: row.mailbox_provider || 'mail_tm',
    accountsPerDay: clampInt(row.accounts_per_day, 0, 10000, 25),
    mailboxCreatePerDay: clampInt(row.mailbox_create_per_day, 0, 10000, 25),
    inboxRefreshPerMinute: clampInt(row.inbox_refresh_per_minute, 0, 1000, 10),
  };
}

export function updateWorkspaceSettings(workspaceId: number, userId: number, payload: any): WorkspaceSettingsResponse {
  assertCanManageWorkspaceSettings(workspaceId, userId);
  ensureWorkspaceSettings(workspaceId);
  const current = getWorkspaceSettingsForApi(workspaceId);
  const next = {
    historyRetentionDays: clampInt(payload?.historyRetentionDays, 1, 3650, current.historyRetentionDays),
    historyLimit: clampInt(payload?.historyLimit, 1, 1000, current.historyLimit),
    allowBulkGeneration: typeof payload?.allowBulkGeneration === 'boolean' ? payload.allowBulkGeneration : current.allowBulkGeneration,
    maxBulkCount: clampInt(payload?.maxBulkCount, 1, 100, current.maxBulkCount),
    mailboxProvider: normalizeKey(payload?.mailboxProvider, current.mailboxProvider, 40),
    accountsPerDay: clampInt(payload?.accountsPerDay, 0, 10000, current.accountsPerDay),
    mailboxCreatePerDay: clampInt(payload?.mailboxCreatePerDay, 0, 10000, current.mailboxCreatePerDay),
    inboxRefreshPerMinute: clampInt(payload?.inboxRefreshPerMinute, 0, 1000, current.inboxRefreshPerMinute),
  };

  db.prepare(`
    UPDATE workspace_settings
    SET history_retention_days = ?,
        history_limit = ?,
        allow_bulk_generation = ?,
        max_bulk_count = ?,
        mailbox_provider = ?,
        accounts_per_day = ?,
        mailbox_create_per_day = ?,
        inbox_refresh_per_minute = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ?
  `).run(
    next.historyRetentionDays,
    next.historyLimit,
    next.allowBulkGeneration ? 1 : 0,
    next.maxBulkCount,
    next.mailboxProvider,
    next.accountsPerDay,
    next.mailboxCreatePerDay,
    next.inboxRefreshPerMinute,
    workspaceId,
  );

  return getWorkspaceSettingsForApi(workspaceId);
}

export function assertCanReadWorkspaceSettings(workspaceId: number, userId: number) {
  assertWorkspaceRole(userId, workspaceId, ['owner', 'admin', 'member', 'viewer']);
}

function assertCanManageWorkspaceSettings(workspaceId: number, userId: number) {
  const row = db.prepare(`
    SELECT wm.role as member_role, u.role as user_role
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ? AND wm.user_id = ?
    LIMIT 1
  `).get(workspaceId, userId) as { member_role: string; user_role: string } | undefined;
  if (!row || (!['owner', 'admin'].includes(row.member_role) && row.user_role !== 'admin')) {
    throw new ApiError('workspace_settings_forbidden', 'Workspace settings require owner or admin access', 403);
  }
}

function ensureUserSettings(userId: number) {
  db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
}

function ensureWorkspaceSettings(workspaceId: number) {
  db.prepare('INSERT OR IGNORE INTO workspace_settings (workspace_id) VALUES (?)').run(workspaceId);
}

function normalizeKey(value: unknown, fallback: string, maxLength: number) {
  const next = String(value ?? '').trim().slice(0, maxLength);
  return next || fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(next)));
}

function isPersona(value: unknown): value is PersonaKey {
  return typeof value === 'string' && PERSONAS.includes(value);
}
