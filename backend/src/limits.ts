import db from './db.js';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface WorkspaceSettingsRow {
  history_limit: number;
  history_retention_days?: number;
  allow_bulk_generation?: number;
  max_bulk_count: number;
  mailbox_provider?: string;
  shared_account_editing?: string;
  workspace_creation_policy?: string;
  accounts_per_day: number;
  mailbox_create_per_day: number;
  inbox_refresh_per_minute: number;
}

export const USAGE_EVENTS = {
  accountGenerated: 'account_generated',
  mailboxCreated: 'mailbox_created',
  inboxRefreshed: 'inbox_refreshed',
} as const;

export function getWorkspaceSettings(workspaceId: number): WorkspaceSettingsRow {
  const settings = db.prepare(`
    SELECT history_retention_days, history_limit, allow_bulk_generation, max_bulk_count,
           shared_account_editing, workspace_creation_policy,
           accounts_per_day, mailbox_create_per_day, inbox_refresh_per_minute
    FROM workspace_settings
    WHERE workspace_id = ?
  `).get(workspaceId) as WorkspaceSettingsRow | undefined;

  return settings ?? {
    history_retention_days: 30,
    history_limit: 50,
    allow_bulk_generation: 1,
    max_bulk_count: 25,
    shared_account_editing: 'creator_only',
    workspace_creation_policy: 'active_users',
    accounts_per_day: 25,
    mailbox_create_per_day: 25,
    inbox_refresh_per_minute: 10,
  };
}

export function getUsageSummary(workspaceId: number, userId: number) {
  const settings = getWorkspaceSettings(workspaceId);
  return {
    settings: {
      historyRetentionDays: Number(settings.history_retention_days ?? 30),
      historyLimit: settings.history_limit,
      allowBulkGeneration: Boolean(settings.allow_bulk_generation ?? 1),
      maxBulkCount: settings.max_bulk_count,
      sharedAccountEditing: settings.shared_account_editing ?? 'creator_only',
      workspaceCreationPolicy: settings.workspace_creation_policy ?? 'active_users',
    },
    limits: {
      accountsPerDay: buildUsage(workspaceId, userId, USAGE_EVENTS.accountGenerated, settings.accounts_per_day, '-1 day'),
      mailboxesPerDay: buildUsage(workspaceId, userId, USAGE_EVENTS.mailboxCreated, settings.mailbox_create_per_day, '-1 day'),
      inboxRefreshPerMinute: buildUsage(workspaceId, userId, USAGE_EVENTS.inboxRefreshed, settings.inbox_refresh_per_minute, '-1 minute'),
    },
  };
}

export function enforceDailyLimit(workspaceId: number, userId: number, eventType: string, limit: number, code: string, message: string, quantity = 1) {
  enforceLimit(workspaceId, userId, eventType, limit, '-1 day', code, message, quantity);
}

export function enforceMinuteLimit(workspaceId: number, userId: number, eventType: string, limit: number, code: string, message: string, quantity = 1) {
  enforceLimit(workspaceId, userId, eventType, limit, '-1 minute', code, message, quantity);
}

export function recordUsageEvent(workspaceId: number, userId: number, eventType: string, quantity = 1) {
  db.prepare(`
    INSERT INTO usage_events (workspace_id, user_id, event_type, quantity)
    VALUES (?, ?, ?, ?)
  `).run(workspaceId, userId, eventType, quantity);
}

function buildUsage(workspaceId: number, userId: number, eventType: string, limit: number, since: string) {
  const used = getUsedQuantity(workspaceId, userId, eventType, since);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

function enforceLimit(workspaceId: number, userId: number, eventType: string, limit: number, since: string, code: string, message: string, quantity: number) {
  if (limit <= 0) {
    throw new ApiError(code, message, 429);
  }

  const used = getUsedQuantity(workspaceId, userId, eventType, since);
  if (used + quantity > limit) {
    throw new ApiError(code, message, 429);
  }
}

function getUsedQuantity(workspaceId: number, userId: number, eventType: string, since: string) {
  const used = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS used
    FROM usage_events
    WHERE workspace_id = ?
      AND user_id = ?
      AND event_type = ?
      AND datetime(created_at) >= datetime('now', ?)
  `).get(workspaceId, userId, eventType, since) as { used: number };

  return Number(used.used ?? 0);
}
