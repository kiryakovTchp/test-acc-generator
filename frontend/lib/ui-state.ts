import type { HistoryItem } from './api';

export type HistoryStatus = 'generated' | 'email_received' | 'waiting';
export type AccountBalanceStatus = 'unknown' | 'no_balance' | 'has_balance';
export type SettingsTab = 'defaults' | 'workspace' | 'invites' | 'team' | 'security' | 'analytics' | 'activity';

export const BALANCE_STATUS_OPTIONS: Array<{ value: AccountBalanceStatus; label: string }> = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'no_balance', label: 'No balance' },
  { value: 'has_balance', label: 'Has balance' },
];

export function mapHistoryStatus(item: Pick<HistoryItem, 'inboxStatus'>): HistoryStatus {
  if (item.inboxStatus === 'email_received') return 'email_received';
  if (item.inboxStatus === 'waiting_for_email' || item.inboxStatus === 'no_email_found') return 'waiting';
  return 'generated';
}

export function mapDetailStatus(detail: { inbox: { status: HistoryItem['inboxStatus'] } } | null): HistoryStatus {
  if (!detail) return 'waiting';
  if (detail.inbox.status === 'email_received') return 'email_received';
  if (detail.inbox.status === 'no_email_found') return 'waiting';
  return 'generated';
}

export function statusTone(status: HistoryStatus) {
  if (status === 'email_received') return 'success';
  if (status === 'generated') return 'active';
  return 'warning';
}

export function inviteStatusTone(status: string) {
  if (status === 'accepted') return 'success';
  if (status === 'pending') return 'active';
  return 'warning';
}

export function roleTone(role: string) {
  if (role === 'owner' || role === 'admin') return 'success';
  if (role === 'member' || role === 'user') return 'active';
  return 'warning';
}

export function statusLabel(status: HistoryStatus) {
  if (status === 'email_received') return 'Email received';
  if (status === 'generated') return 'Generated';
  return 'Waiting';
}

export function balanceStatusLabel(status: AccountBalanceStatus) {
  return BALANCE_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? 'Unknown';
}

export function balanceStatusTone(status: AccountBalanceStatus) {
  if (status === 'has_balance') return 'success';
  if (status === 'no_balance') return 'warning';
  return 'active';
}

export function isWorkspaceShared(item: { sharedWithWorkspace?: boolean | number }) {
  return item.sharedWithWorkspace === true || item.sharedWithWorkspace === 1;
}

export function scopeTone(item: { sharedWithWorkspace?: boolean | number }) {
  return isWorkspaceShared(item) ? 'success' : 'active';
}

export function scopeLabel(item: { sharedWithWorkspace?: boolean | number }) {
  return isWorkspaceShared(item) ? 'Shared' : 'Private';
}

export function buildSettingsTabs(input: {
  bulkCount: number;
  workspaceName?: string;
  inviteCount: number;
  memberCount: number;
  activeSessionCount: number;
  generated24h: number;
  activityCount: number;
}) {
  return [
    { key: 'defaults', label: 'Defaults', meta: `${input.bulkCount} bulk` },
    { key: 'workspace', label: 'Workspace', meta: input.workspaceName ?? 'No workspace' },
    { key: 'invites', label: 'Invites', meta: `${input.inviteCount} links` },
    { key: 'team', label: 'Team', meta: `${input.memberCount} members` },
    { key: 'security', label: 'Security', meta: `${input.activeSessionCount} sessions` },
    { key: 'analytics', label: 'Analytics', meta: `${input.generated24h} today` },
    { key: 'activity', label: 'Activity', meta: `${input.activityCount} events` },
  ] satisfies Array<{ key: SettingsTab; label: string; meta: string }>;
}
