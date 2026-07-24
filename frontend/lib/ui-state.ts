import type { HistoryItem } from './api';
import { translate, type Locale } from './i18n';

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

export function roleLabel(role: string, locale: Locale = 'en') {
  if (locale === 'en') return role;
  if (role === 'owner') return 'владелец';
  if (role === 'admin') return 'админ';
  if (role === 'member') return 'участник';
  if (role === 'viewer') return 'просмотр';
  if (role === 'user') return 'пользователь';
  return role;
}

export function workspaceStatusLabel(status: string, locale: Locale = 'en') {
  if (locale === 'en') return status;
  if (status === 'active') return 'активна';
  if (status === 'archived') return 'архив';
  return status;
}

export function statusLabel(status: HistoryStatus, locale: Locale = 'en') {
  if (status === 'email_received') return translate(locale, 'Email received');
  if (status === 'generated') return translate(locale, 'Generated');
  return translate(locale, 'Waiting');
}

export function balanceStatusLabel(status: AccountBalanceStatus, locale: Locale = 'en') {
  return translate(locale, BALANCE_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? 'Unknown');
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

export function scopeLabel(item: { sharedWithWorkspace?: boolean | number }, locale: Locale = 'en') {
  return isWorkspaceShared(item) ? translate(locale, 'Shared') : translate(locale, 'Private');
}

export function buildSettingsTabs(input: {
  bulkCount: number;
  workspaceName?: string;
  inviteCount: number;
  memberCount: number;
  activeSessionCount: number;
  generated24h: number;
  activityCount: number;
  locale?: Locale;
}) {
  const locale = input.locale ?? 'en';
  return [
    { key: 'defaults', label: translate(locale, 'Defaults'), meta: locale === 'ru' ? `${input.bulkCount} в пакете` : `${input.bulkCount} bulk` },
    { key: 'workspace', label: translate(locale, 'Workspace'), meta: input.workspaceName ?? translate(locale, 'No workspace') },
    { key: 'invites', label: translate(locale, 'Invites'), meta: locale === 'ru' ? `${input.inviteCount} ссылок` : `${input.inviteCount} links` },
    { key: 'team', label: translate(locale, 'Team'), meta: locale === 'ru' ? `${input.memberCount} участников` : `${input.memberCount} members` },
    { key: 'security', label: translate(locale, 'Security'), meta: locale === 'ru' ? `${input.activeSessionCount} сессий` : `${input.activeSessionCount} sessions` },
    { key: 'analytics', label: translate(locale, 'Analytics'), meta: locale === 'ru' ? `${input.generated24h} сегодня` : `${input.generated24h} today` },
    { key: 'activity', label: translate(locale, 'Activity'), meta: locale === 'ru' ? `${input.activityCount} событий` : `${input.activityCount} events` },
  ] satisfies Array<{ key: SettingsTab; label: string; meta: string }>;
}
