'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mdilLogout, mdilUnfoldMoreHorizontal } from '@mdi/light-js';
import { apiFetch, type ActivityItem, type AlertItem, type AnalyticsSummary, type AuthSession, type GeoItem, type HistoryItem, type UsageSummary, type UserInfo, type UserSettings, type WorkspaceInvite, type WorkspaceMember, type WorkspaceSettings as ServerWorkspaceSettings, type WorkspaceSummary } from '@/lib/api';
import { LOCALE_OPTIONS, normalizeLocale, translate, type Locale } from '@/lib/i18n';
import { BALANCE_STATUS_OPTIONS, balanceStatusLabel, balanceStatusTone, buildSettingsTabs, inviteStatusTone, isWorkspaceShared, mapDetailStatus, mapHistoryStatus, roleLabel, roleTone, scopeLabel, scopeTone, statusLabel, statusTone, workspaceStatusLabel, type AccountBalanceStatus, type HistoryStatus, type SettingsTab } from '@/lib/ui-state';

type PersonaKey = 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';
type AppView = 'main' | 'accounts' | 'mailboxes' | 'form_data' | 'codes' | 'settings';
type NavKey = Exclude<AppView, 'main'>;
type BrowserGenerationSettings = {
  selectedGeo: string;
  documentType: string;
  bulkCount: number;
  persona: PersonaKey;
  accountRole: 'admin' | 'user';
  mailboxProvider: MailboxProviderKey;
};

type AccountSwitchProfile = Pick<UserInfo, 'id' | 'login' | 'role' | 'email' | 'username' | 'workspaceId' | 'workspaceRole'>;

type MailboxProviderKey = 'mail_tm' | 'mail_gw' | 'mail_tm_mail_gw_fallback';

interface Detail {
  id: number;
  createdByUserId?: number;
  createdByLogin?: string;
  sharedWithWorkspace?: boolean;
  sharedAt?: string | null;
  geoKey: string;
  geoLabel: string;
  email: string;
  emailPassword: string;
  username: string;
  siteAccountId: string;
  balanceStatus: AccountBalanceStatus;
  firstName: string;
  lastName: string;
  phone: string;
  age: number;
  gender: 'male' | 'female';
  dateOfBirth: string;
  country: string;
  region: string;
  city: string;
  placeOfBirth: string;
  addressLine: string;
  postalCode: string;
  persona: PersonaKey;
  role: 'admin' | 'user';
  documentType: string;
  documentValue: string;
  documentIssueDate: string;
  documentQuality: 'verified' | 'synthetic_pattern' | 'missing_rules';
  mailboxProvider?: MailboxProviderKey;
  fullProfileText: string;
  inbox: {
    status: 'waiting_for_email' | 'email_received' | 'no_email_found';
    sender: string;
    subject: string;
    receivedAt: string;
    plainText: string;
    links: Array<{ url: string; label?: string; isPrimary?: boolean }>;
    primaryVerificationLink?: { url: string; label?: string; isPrimary?: boolean } | null;
    codes: string[];
    rawHtml?: string | null;
  };
  createdAt: string;
}

interface TempMailbox {
  address: string;
  password: string;
  provider?: MailboxProviderKey;
}

type MailboxInbox = Detail['inbox'];

const PERSONAS: Array<{ value: PersonaKey; label: string }> = [
  { value: 'standard_user', label: 'Standard User · 25–40' },
  { value: 'young_user', label: 'Young User · 18–24' },
  { value: 'senior_user', label: 'Senior User · 55+' },
  { value: 'male_user', label: 'Male User' },
  { value: 'female_user', label: 'Female User' },
];

const MAILBOX_PROVIDER_OPTIONS: Array<{ value: MailboxProviderKey; label: string }> = [
  { value: 'mail_tm', label: 'mail.tm' },
  { value: 'mail_gw', label: 'mail.gw' },
  { value: 'mail_tm_mail_gw_fallback', label: 'mail.tm -> mail.gw fallback' },
];

const NAV_ITEMS: Array<{ key: AppView; label: string; short: string; href: string }> = [
  { key: 'main', label: 'Main', short: 'MN', href: '/main' },
  { key: 'accounts', label: 'Test Users', short: 'TU', href: '/accounts' },
  { key: 'mailboxes', label: 'Mailboxes', short: 'MB', href: '/mailboxes' },
  { key: 'codes', label: 'Verification', short: 'VF', href: '/codes' },
  { key: 'settings', label: 'Settings', short: 'ST', href: '/settings' },
];

const SETTINGS_STORAGE_KEY = 'tag-workspace-settings';
const ACCOUNT_SWITCHER_STORAGE_KEY = 'tag-account-switcher-profiles';

function tr(locale: Locale, text: string) {
  return translate(locale, text);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatCompactDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PHONE_COUNTRY_CODES: Record<string, string> = {
  nigeria: '234',
  kazakhstan: '7',
  uzbekistan: '998',
  ghana: '233',
  georgia: '995',
  ireland: '353',
  angola: '244',
  gambia: '220',
  malawi: '265',
  sierra_leone: '232',
  togo: '228',
  gabon: '241',
  ethiopia: '251',
  senegal: '221',
  tanzania: '255',
  zambia: '260',
  uganda: '256',
  kenya: '254',
  cameroon: '237',
  generic_intl: '44',
};

function localPhoneDigits(phone: string, geoKey?: string) {
  const digits = phone.replace(/\D/g, '');
  const countryCode = geoKey ? PHONE_COUNTRY_CODES[geoKey] : undefined;
  if (countryCode && digits.startsWith(countryCode)) {
    return digits.slice(countryCode.length);
  }
  return digits;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (typeof document === 'undefined') return null;
  try {
    const storage = window.localStorage;
    if (!storage) return null;
    return typeof storage.getItem === 'function'
      && typeof storage.setItem === 'function'
      && typeof storage.removeItem === 'function'
      && typeof storage.clear === 'function'
      ? storage
      : null;
  } catch {
    return null;
  }
}

function accountProfileFromUser(user: UserInfo): AccountSwitchProfile {
  return {
    id: user.id,
    login: user.login,
    role: user.role,
    email: user.email,
    username: user.username,
    workspaceId: user.workspaceId,
    workspaceRole: user.workspaceRole,
  };
}

function normalizeSavedAccounts(accounts: AccountSwitchProfile[]) {
  const seen = new Set<number>();
  return accounts
    .filter((account) => Number.isInteger(account.id) && account.id > 0 && typeof account.login === 'string' && account.login.trim())
    .filter((account) => {
      if (seen.has(account.id)) return false;
      seen.add(account.id);
      return true;
    })
    .slice(0, 6);
}

function upsertSavedAccount(accounts: AccountSwitchProfile[], user: UserInfo) {
  const profile = accountProfileFromUser(user);
  return normalizeSavedAccounts([profile, ...accounts.filter((account) => account.id !== profile.id)]);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

function isPersonaKey(value: unknown): value is PersonaKey {
  return typeof value === 'string' && PERSONAS.some((item) => item.value === value);
}

function isRole(value: unknown): value is 'admin' | 'user' {
  return value === 'admin' || value === 'user';
}

function isMailboxProviderKey(value: unknown): value is MailboxProviderKey {
  return typeof value === 'string' && MAILBOX_PROVIDER_OPTIONS.some((item) => item.value === value);
}

function mailboxProviderLabel(value?: string) {
  return MAILBOX_PROVIDER_OPTIONS.find((item) => item.value === value)?.label ?? 'mail.tm';
}

function alertCopy(item: AlertItem, locale: Locale) {
  if (locale === 'en') return item;
  const usageMessage = () => {
    const parts = item.message.match(/(\d+) of (\d+)/);
    return parts ? `Использовано ${parts[1]} из ${parts[2]} доступных действий.` : tr(locale, item.message);
  };
  if (item.id === 'dataset-review-24h') {
    const count = Number(item.title.match(/\d+/)?.[0] ?? 0);
    return {
      ...item,
      title: count === 1 ? 'Проверка датасета: создан 1 профиль' : `Проверка датасета: создано профилей ${count}`,
      message: 'Часть форматов документов синтетическая или пока без правил. Откройте профиль, чтобы увидеть статус документа.',
      metric: 'Документы',
    };
  }
  if (item.id.endsWith('-disabled')) {
    return { ...item, title: `${tr(locale, item.title.replace(' disabled', ''))}: отключено`, message: 'Лимит для этого действия установлен в 0.', metric: '0 лимит' };
  }
  if (item.id.endsWith('-limit-reached')) {
    return { ...item, title: `${tr(locale, item.title.replace(' limit reached', ''))}: лимит исчерпан`, message: usageMessage(), metric: item.metric };
  }
  if (item.id.endsWith('-limit-warning')) {
    return { ...item, title: `${tr(locale, item.title.replace(' limit near', ''))}: близко к лимиту`, message: usageMessage(), metric: item.metric };
  }
  return { ...item, title: tr(locale, item.title), message: tr(locale, item.message), metric: item.metric ? tr(locale, item.metric) : item.metric };
}

export default function AppShell({ view = 'main' }: { view?: AppView }) {
  const activeNav = view;
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [geoItems, setGeoItems] = useState<GeoItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedGeo, setSelectedGeo] = useState('nigeria');
  const [documentType, setDocumentType] = useState('nin');
  const [bulkCount, setBulkCount] = useState(5);
  const [persona, setPersona] = useState<PersonaKey>('standard_user');
  const [accountRole, setAccountRole] = useState<'admin' | 'user'>('user');
  const [mailboxProvider, setMailboxProvider] = useState<MailboxProviderKey>('mail_tm');
  const [hasStoredMailboxProvider, setHasStoredMailboxProvider] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const isRefreshingInboxRef = useRef(false);
  const [isReplacingMailbox, setIsReplacingMailbox] = useState(false);
  const [isRegeneratingPhone, setIsRegeneratingPhone] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [savingBalanceId, setSavingBalanceId] = useState<number | null>(null);
  const [savingSharingId, setSavingSharingId] = useState<number | null>(null);
  const [inboxStatusLabel, setInboxStatusLabel] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HistoryStatus>('all');
  const [balanceFilter, setBalanceFilter] = useState<'all' | AccountBalanceStatus>('all');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest'>('newest');
  const [accountGeoFilter, setAccountGeoFilter] = useState('all');
  const [siteAccountIdDraft, setSiteAccountIdDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [tempMailbox, setTempMailbox] = useState<TempMailbox | null>(null);
  const [tempMailboxInbox, setTempMailboxInbox] = useState<MailboxInbox | null>(null);
  const [isRefreshingTempMailbox, setIsRefreshingTempMailbox] = useState(false);
  const [isCreatingMailbox, setIsCreatingMailbox] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [workspaceSettings, setWorkspaceSettings] = useState<ServerWorkspaceSettings | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvite[]>([]);
  const [memberLookup, setMemberLookup] = useState('');
  const [memberRole, setMemberRole] = useState<WorkspaceMember['workspaceRole']>('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceInvite['role']>('member');
  const [lastInviteToken, setLastInviteToken] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('Saved locally');
  const [locale, setLocale] = useState<Locale>('en');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountUsername, setAccountUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountStatus, setAccountStatus] = useState('Account ready');
  const [mailProviderStatus, setMailProviderStatus] = useState('Provider not checked');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<AccountSwitchProfile[]>([]);
  const savedAccountsRef = useRef<AccountSwitchProfile[]>([]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [switchLogin, setSwitchLogin] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<number | null>(null);
  const t = (text: string) => tr(locale, text);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;

    const storedUser = storage.getItem('tag-user');
    const storedAccounts = storage.getItem(ACCOUNT_SWITCHER_STORAGE_KEY);
    let loadedProfiles: AccountSwitchProfile[] = [];

    storage.removeItem('tag-token');
    if (storedAccounts) {
      try {
        loadedProfiles = normalizeSavedAccounts(JSON.parse(storedAccounts) as AccountSwitchProfile[]);
        saveAccountProfiles(loadedProfiles);
      } catch {
        storage.removeItem(ACCOUNT_SWITCHER_STORAGE_KEY);
      }
    }

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as UserInfo;
        saveAccountProfiles(upsertSavedAccount(loadedProfiles, parsedUser));
        setUser(parsedUser);
        refreshSession(parsedUser.workspaceId).catch(() => {
          storage.removeItem('tag-user');
          setUser(null);
        });
      } catch {
        storage.removeItem('tag-user');
      }
    }

    const storedSettings = storage.getItem(SETTINGS_STORAGE_KEY);
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings) as Partial<BrowserGenerationSettings>;
        if (typeof parsed.selectedGeo === 'string') setSelectedGeo(parsed.selectedGeo);
        if (typeof parsed.documentType === 'string') setDocumentType(parsed.documentType);
        if (isPersonaKey(parsed.persona)) setPersona(parsed.persona);
        if (isRole(parsed.accountRole)) setAccountRole(parsed.accountRole);
        if (isMailboxProviderKey(parsed.mailboxProvider)) {
          setMailboxProvider(parsed.mailboxProvider);
          setHasStoredMailboxProvider(true);
        }
        if (typeof parsed.bulkCount === 'number') setBulkCount(Math.min(25, Math.max(1, parsed.bulkCount)));
      } catch {
        storage.removeItem(SETTINGS_STORAGE_KEY);
      }
    }
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!token) return;
    refresh(token, { showLoading: true }).catch((err) => {
      if (err instanceof Error && /unauthorized/i.test(err.message)) {
        refreshSession().catch(() => {
          clearAuthState();
          setError('Session expired. Please sign in again.');
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load data');
    });
  }, [token]);

  const currentGeo = useMemo(() => geoItems.find((item) => item.key === selectedGeo), [geoItems, selectedGeo]);
  const effectiveDocumentType = currentGeo?.documentTypes.includes(documentType)
    ? documentType
    : currentGeo?.documentTypes[0] ?? documentType;

  useEffect(() => {
    if (!settingsReady) return;
    const storage = getBrowserStorage();
    if (!storage) return;
    const settings: BrowserGenerationSettings = { selectedGeo, documentType: effectiveDocumentType, bulkCount, persona, accountRole, mailboxProvider };
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [accountRole, bulkCount, documentType, effectiveDocumentType, mailboxProvider, persona, selectedGeo, settingsReady]);

  function selectGeo(nextGeoKey: string) {
    setSelectedGeo(nextGeoKey);
    const nextGeo = geoItems.find((item) => item.key === nextGeoKey);
    if (nextGeo?.documentTypes.length) {
      setDocumentType(nextGeo.documentTypes[0]);
    }
  }

  function selectMailboxProvider(nextProvider: MailboxProviderKey) {
    setMailboxProvider(nextProvider);
    setHasStoredMailboxProvider(true);
  }

  useEffect(() => {
    if (currentGeo?.documentTypes.length && !currentGeo.documentTypes.includes(documentType)) {
      setDocumentType(currentGeo.documentTypes[0]);
    }
  }, [currentGeo?.key, documentType]);

  const filteredHistory = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    const next = history.filter((item) => {
      const status = mapHistoryStatus(item);
      const matchesSearch = !term || [item.username, item.email, item.geoLabel, item.siteAccountId].some((value) => value.toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesBalance = balanceFilter === 'all' || item.balanceStatus === balanceFilter;
      const matchesGeo = accountGeoFilter === 'all' || item.geoKey === accountGeoFilter;
      return matchesSearch && matchesStatus && matchesBalance && matchesGeo;
    });

    next.sort((a, b) => sortMode === 'newest'
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return next;
  }, [accountGeoFilter, accountSearch, balanceFilter, history, sortMode, statusFilter]);

  const recentHistory = useMemo(() => {
    return [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [history]);

  const selectedStatus = mapDetailStatus(detail);
  const currentWorkspace = workspaces.find((item) => item.id === user?.workspaceId);
  const accountSwitcherAccounts = user ? upsertSavedAccount(savedAccounts, user) : savedAccounts;
  const primaryActionsDisabled = !detail;
  const recentCount = history.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 24 * 60 * 60 * 1000).length;
  const isGenerateDisabled = isGenerating || isBulkGenerating;
  const maxBulkCount = usageSummary?.settings.maxBulkCount ?? 25;
  const verificationCodes = detail?.inbox.codes ?? [];
  const verificationReceivedAt = detail?.inbox.receivedAt;
  const hasVerificationCodes = verificationCodes.length > 0;
  const activationLink = detail?.inbox.primaryVerificationLink?.url
    ?? detail?.inbox.links.find((link) => link.isPrimary)?.url
    ?? detail?.inbox.links[0]?.url
    ?? '';
  const showQuickActions = activeNav === 'main';
  const isWorkspaceBootstrapping = Boolean(token && user && (isWorkspaceLoading || !usageSummary));
  const hasActiveAccountFilters = accountSearch.trim() !== ''
    || statusFilter !== 'all'
    || balanceFilter !== 'all'
    || accountGeoFilter !== 'all';

  useEffect(() => {
    setSiteAccountIdDraft(detail?.siteAccountId ?? '');
    setInboxStatusLabel('');
  }, [detail?.id, detail?.siteAccountId]);

  useEffect(() => {
    setPhoneDraft(detail?.phone ?? '');
  }, [detail?.id, detail?.phone]);

  useEffect(() => {
    isRefreshingInboxRef.current = isRefreshingInbox;
  }, [isRefreshingInbox]);

  useEffect(() => {
    if (!token || !detail || detail.inbox.status === 'email_received') return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const maxAttempts = 6;

    async function pollInbox() {
      if (cancelled || !detail || isRefreshingInboxRef.current) return;
      attempts += 1;
      isRefreshingInboxRef.current = true;
      setIsRefreshingInbox(true);
      setInboxStatusLabel(locale === 'ru' ? `Автопроверка ${attempts}/${maxAttempts}` : `Auto-check ${attempts}/${maxAttempts}`);
      try {
        const updated = await apiFetch<Detail>(`/history/${detail.id}/refresh-inbox?debug=1`, token, {
          method: 'POST',
          body: JSON.stringify({ waitMs: 30000 }),
        });
        if (cancelled) return;
        setDetail((current) => current?.id === detail.id ? updated : current);
        setInboxStatusLabel(updated.inbox.status === 'email_received' ? 'Email received' : 'Auto-check active');
        await refresh();
        if (updated.inbox.status === 'email_received') return;
      } catch {
        if (!cancelled) setInboxStatusLabel('Auto-check paused');
        return;
      } finally {
        isRefreshingInboxRef.current = false;
        if (!cancelled) setIsRefreshingInbox(false);
      }

      if (!cancelled && attempts < maxAttempts) {
        timeoutId = setTimeout(pollInbox, 15000);
      } else if (!cancelled) {
        setInboxStatusLabel('No email found');
      }
    }

    timeoutId = setTimeout(pollInbox, 5000);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [detail?.id, detail?.inbox.status, locale, token]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
        return;
      }

      if (!user || isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'g') {
        event.preventDefault();
        if (!isGenerateDisabled) void generate();
      }
      if (key === 'b') {
        event.preventDefault();
        if (!isGenerateDisabled) void generateBulk();
      }
      if (key === 'r') {
        event.preventDefault();
        if (!primaryActionsDisabled && !isRefreshingInbox) void refreshInboxForDetail(30000);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  async function refresh(authToken = token, options: { showLoading?: boolean } = {}) {
    if (options.showLoading) setIsWorkspaceLoading(true);
    try {
      const me = await apiFetch<{ user: UserInfo }>('/auth/me', authToken);
      setUser(me.user);
      setAccountEmail(me.user.email ?? '');
      setAccountUsername(me.user.username ?? me.user.login);
      const workspaceId = me.user.workspaceId;
      const canLoadInvites = ['owner', 'admin'].includes(me.user.workspaceRole ?? '');
      const [geo, historyRes, limitsRes, alertsRes, analyticsRes, activityRes, userSettingsRes, workspacesRes, workspaceSettingsRes, workspaceMembersRes, workspaceInvitesRes, sessionsRes] = await Promise.all([
        apiFetch<{ items: GeoItem[] }>('/geo-rules', authToken),
        apiFetch<{ items: HistoryItem[] }>('/history', authToken),
        apiFetch<UsageSummary>('/limits', authToken),
        apiFetch<{ items: AlertItem[] }>('/alerts', authToken),
        apiFetch<{ summary: AnalyticsSummary }>('/analytics/summary', authToken),
        apiFetch<{ items: ActivityItem[] }>('/activity', authToken),
        apiFetch<{ settings: UserSettings }>('/user/settings', authToken),
        apiFetch<{ workspaces: WorkspaceSummary[] }>('/workspaces', authToken),
        workspaceId ? apiFetch<{ settings: ServerWorkspaceSettings }>(`/workspaces/${workspaceId}/settings`, authToken) : Promise.resolve({ settings: null }),
        workspaceId ? apiFetch<{ members: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`, authToken) : Promise.resolve({ members: [] }),
        workspaceId && canLoadInvites ? apiFetch<{ invites: WorkspaceInvite[] }>(`/workspaces/${workspaceId}/invites`, authToken) : Promise.resolve({ invites: [] }),
        apiFetch<{ sessions: AuthSession[] }>('/auth/sessions', authToken),
      ]);
      setGeoItems(geo.items);
      setHistory(historyRes.items);
      setUsageSummary(limitsRes);
      setAlertItems(alertsRes.items);
      setAnalyticsSummary(analyticsRes.summary);
      setActivityItems(activityRes.items);
      setUserSettings(userSettingsRes.settings);
      setLocale(normalizeLocale(userSettingsRes.settings.locale));
      setWorkspaces(workspacesRes.workspaces);
      setWorkspaceSettings(workspaceSettingsRes.settings);
      setWorkspaceMembers(workspaceMembersRes.members);
      setWorkspaceInvites(workspaceInvitesRes.invites);
      setAuthSessions(sessionsRes.sessions);
      if (!hasStoredMailboxProvider && workspaceSettingsRes.settings?.mailboxProvider) {
        setMailboxProvider(workspaceSettingsRes.settings?.mailboxProvider ?? 'mail_tm');
      }
      if (!userSettings) {
        const defaultGeo = geo.items.some((item) => item.key === userSettingsRes.settings.defaultGeo)
          ? userSettingsRes.settings.defaultGeo
          : geo.items[0]?.key ?? userSettingsRes.settings.defaultGeo;
        const defaultGeoItem = geo.items.find((item) => item.key === defaultGeo);
        setSelectedGeo(defaultGeo);
        setDocumentType(defaultGeoItem?.documentTypes.includes(userSettingsRes.settings.defaultDocumentType)
          ? userSettingsRes.settings.defaultDocumentType
          : defaultGeoItem?.documentTypes[0] ?? userSettingsRes.settings.defaultDocumentType);
        setPersona(userSettingsRes.settings.defaultPersona);
        setBulkCount(Math.min(limitsRes.settings.maxBulkCount, Math.max(1, userSettingsRes.settings.bulkCount)));
      } else {
        setBulkCount((value) => Math.min(limitsRes.settings.maxBulkCount, Math.max(1, value)));
      }
      if ((!selectedGeo || !geo.items.some((item) => item.key === selectedGeo)) && geo.items[0]) {
        setSelectedGeo(geo.items[0].key);
        setDocumentType(geo.items[0].documentTypes[0] ?? documentType);
      }
    } finally {
      if (options.showLoading) setIsWorkspaceLoading(false);
    }
  }

  async function refreshUsage(authToken = token) {
    const [limitsRes, alertsRes, analyticsRes, activityRes, workspacesRes, workspaceSettingsRes, workspaceMembersRes, workspaceInvitesRes] = await Promise.all([
      apiFetch<UsageSummary>('/limits', authToken),
      apiFetch<{ items: AlertItem[] }>('/alerts', authToken),
      apiFetch<{ summary: AnalyticsSummary }>('/analytics/summary', authToken),
      apiFetch<{ items: ActivityItem[] }>('/activity', authToken),
      apiFetch<{ workspaces: WorkspaceSummary[] }>('/workspaces', authToken),
      user?.workspaceId ? apiFetch<{ settings: ServerWorkspaceSettings }>(`/workspaces/${user.workspaceId}/settings`, authToken) : Promise.resolve({ settings: null }),
      user?.workspaceId ? apiFetch<{ members: WorkspaceMember[] }>(`/workspaces/${user.workspaceId}/members`, authToken) : Promise.resolve({ members: [] }),
      user?.workspaceId && ['owner', 'admin'].includes(user.workspaceRole ?? '') ? apiFetch<{ invites: WorkspaceInvite[] }>(`/workspaces/${user.workspaceId}/invites`, authToken) : Promise.resolve({ invites: [] }),
    ]);
    setUsageSummary(limitsRes);
    setAlertItems(alertsRes.items);
    setAnalyticsSummary(analyticsRes.summary);
    setActivityItems(activityRes.items);
    setWorkspaces(workspacesRes.workspaces);
    setWorkspaceSettings(workspaceSettingsRes.settings);
    setWorkspaceMembers(workspaceMembersRes.members);
    setWorkspaceInvites(workspaceInvitesRes.invites);
  }

  async function refreshAuthSessions(authToken = token) {
    const res = await apiFetch<{ sessions: AuthSession[] }>('/auth/sessions', authToken);
    setAuthSessions(res.sessions);
  }

  async function savePersonalSettings() {
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ settings: UserSettings }>('/user/settings', token, {
        method: 'PATCH',
        body: JSON.stringify({
          defaultGeo: selectedGeo,
          defaultPersona: persona,
          defaultDocumentType: effectiveDocumentType,
          bulkCount,
          locale,
        }),
      });
      setUserSettings(res.settings);
      setSettingsStatus('Saved to backend');
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to save personal settings');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function saveWorkspaceSettings() {
    if (!user?.workspaceId || !workspaceSettings) return;
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ settings: ServerWorkspaceSettings }>(`/workspaces/${user.workspaceId}/settings`, token, {
        method: 'PATCH',
        body: JSON.stringify(workspaceSettings),
      });
      setWorkspaceSettings(res.settings);
      setSettingsStatus('Saved to backend');
      await refreshUsage();
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to save workspace settings');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function checkMailboxProviderHealth() {
    setMailProviderStatus('Checking provider');
    try {
      const res = await apiFetch<{ ok: boolean; provider: string; message: string }>('/mailboxes/health', token);
      setMailProviderStatus(res.ok ? res.message : `${res.provider} unavailable`);
    } catch (err) {
      setMailProviderStatus(err instanceof Error ? err.message : 'Provider check failed');
    }
  }

  async function addMember() {
    if (!user?.workspaceId || !memberLookup.trim()) return;
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ members: WorkspaceMember[] }>(`/workspaces/${user.workspaceId}/members`, token, {
        method: 'POST',
        body: JSON.stringify({ login: memberLookup.trim(), role: memberRole }),
      });
      setWorkspaceMembers(res.members);
      setMemberLookup('');
      setMemberRole('member');
      setSettingsStatus('Saved to backend');
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to add workspace member');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function updateMemberRole(userId: number, role: WorkspaceMember['workspaceRole']) {
    if (!user?.workspaceId) return;
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ members: WorkspaceMember[] }>(`/workspaces/${user.workspaceId}/members/${userId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setWorkspaceMembers(res.members);
      setSettingsStatus('Saved to backend');
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to update workspace member');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function removeMember(userId: number) {
    if (!user?.workspaceId) return;
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ members: WorkspaceMember[] }>(`/workspaces/${user.workspaceId}/members/${userId}`, token, { method: 'DELETE' });
      setWorkspaceMembers(res.members);
      setSettingsStatus('Saved to backend');
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to remove workspace member');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function createInvite() {
    if (!user?.workspaceId) return;
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ invite: WorkspaceInvite }>(`/workspaces/${user.workspaceId}/invites`, token, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setLastInviteToken(res.invite.token ?? '');
      setWorkspaceInvites((current) => [res.invite, ...current.filter((item) => item.id !== res.invite.id)]);
      setInviteEmail('');
      setInviteRole('member');
      setSettingsStatus('Invite created');
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to create workspace invite');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function revokeInvite(inviteId: number) {
    if (!user?.workspaceId) return;
    setIsSavingSettings(true);
    setSettingsStatus('Saving');
    try {
      const res = await apiFetch<{ invites: WorkspaceInvite[] }>(`/workspaces/${user.workspaceId}/invites/${inviteId}`, token, { method: 'DELETE' });
      setWorkspaceInvites(res.invites);
      setSettingsStatus('Invite revoked');
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to revoke workspace invite');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function switchWorkspace(workspaceId: number) {
    if (workspaceId === user?.workspaceId) return;
    setError('');
    setIsWorkspaceLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserInfo; workspaces: WorkspaceSummary[] }>(`/workspaces/${workspaceId}/switch`, token, { method: 'POST' });
      setWorkspaces(res.workspaces);
      setDetail(null);
      persistAuthState(res.token, res.user);
      await refresh(res.token, { showLoading: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch workspace');
    } finally {
      setIsWorkspaceLoading(false);
    }
  }

  async function createNewWorkspace() {
    const name = newWorkspaceName.trim();
    if (!name) return;
    setIsSavingSettings(true);
    setSettingsStatus('Creating workspace');
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: UserInfo; workspaces: WorkspaceSummary[] }>('/workspaces', token, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewWorkspaceName('');
      setWorkspaces(res.workspaces);
      setDetail(null);
      persistAuthState(res.token, res.user);
      setSettingsStatus('Workspace created');
      await refresh(res.token, { showLoading: true });
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function updateWorkspaceLifecycle(workspaceId: number, status: WorkspaceSummary['status']) {
    setIsSavingSettings(true);
    setSettingsStatus(status === 'archived' ? 'Archiving workspace' : 'Restoring workspace');
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: UserInfo; workspaces: WorkspaceSummary[]; workspace: WorkspaceSummary }>(`/workspaces/${workspaceId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setWorkspaces(res.workspaces);
      if (workspaceId === user?.workspaceId) {
        setDetail(null);
        persistAuthState(res.token, res.user);
        await refresh(res.token, { showLoading: true });
        setSettingsStatus(status === 'archived' ? 'Workspace archived' : 'Workspace restored');
      } else {
        setSettingsStatus(status === 'archived' ? 'Workspace archived' : 'Workspace restored');
        await refreshUsage(res.token);
      }
    } catch (err) {
      setSettingsStatus('Save failed');
      setError(err instanceof Error ? err.message : 'Failed to update workspace status');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function saveAccountProfile() {
    setIsSavingAccount(true);
    setAccountStatus('Saving profile');
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({ email: accountEmail, username: accountUsername }),
      });
      persistAuthState(res.token, res.user);
      setAccountEmail(res.user.email ?? '');
      setAccountUsername(res.user.username ?? res.user.login);
      setAccountStatus('Profile saved');
    } catch (err) {
      setAccountStatus('Profile save failed');
      setError(err instanceof Error ? err.message : 'Failed to save account profile');
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function changeAccountPassword() {
    setIsSavingAccount(true);
    setAccountStatus('Changing password');
    setError('');
    try {
      if (newPassword !== confirmNewPassword) {
        throw new Error('New password confirmation does not match');
      }
      await apiFetch('/auth/password', token, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setAccountStatus('Password changed');
      await refreshAuthSessions();
    } catch (err) {
      setAccountStatus('Password change failed');
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function revokeSession(sessionId: number) {
    setIsSavingAccount(true);
    setAccountStatus('Revoking session');
    setError('');
    try {
      await apiFetch(`/auth/sessions/${sessionId}`, token, { method: 'DELETE' });
      const wasCurrent = authSessions.some((session) => session.id === sessionId && Boolean(session.isCurrent));
      if (wasCurrent) {
        clearAuthState(user?.id ? { removeAccountId: user.id } : undefined);
        return;
      }
      await refreshAuthSessions();
      setAccountStatus('Session revoked');
    } catch (err) {
      setAccountStatus('Session revoke failed');
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function logoutEverywhere() {
    setIsSavingAccount(true);
    setAccountStatus('Logging out everywhere');
    setError('');
    try {
      await apiFetch('/auth/logout-everywhere', token, { method: 'POST' });
      clearAuthState({ removeAllAccounts: true });
    } catch (err) {
      setAccountStatus('Logout failed');
      setError(err instanceof Error ? err.message : 'Failed to logout everywhere');
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    persistAuthState(res.token, res.user);
  }

  async function addSwitchAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsAddingAccount(true);
    try {
      const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ login: switchLogin, password: switchPassword }),
      });
      setSwitchLogin('');
      setSwitchPassword('');
      setIsAccountMenuOpen(false);
      persistAuthState(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account');
    } finally {
      setIsAddingAccount(false);
    }
  }

  async function switchAccount(account: AccountSwitchProfile) {
    if (account.id === user?.id) {
      setIsAccountMenuOpen(false);
      return;
    }
    setError('');
    setSwitchingAccountId(account.id);
    try {
      const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/switch-account', undefined, {
        method: 'POST',
        body: JSON.stringify({ userId: account.id, workspaceId: account.workspaceId }),
      });
      setIsAccountMenuOpen(false);
      persistAuthState(res.token, res.user);
    } catch (err) {
      removeSavedAccount(account.id);
      setError(err instanceof Error ? `${account.login}: ${err.message}` : `Failed to switch to ${account.login}`);
    } finally {
      setSwitchingAccountId(null);
    }
  }

  async function refreshSession(workspaceId = user?.workspaceId) {
    const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/refresh', undefined, {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    });
    persistAuthState(res.token, res.user);
    return res.token;
  }

  async function logout() {
    const currentUserId = user?.id;
    try {
      if (token) {
        await apiFetch('/auth/logout', token, { method: 'POST' });
      }
    } catch {
      // Local cleanup still wins if the server session was already gone.
    }
    clearAuthState(currentUserId ? { removeAccountId: currentUserId } : undefined);
  }

  function saveAccountProfiles(accounts: AccountSwitchProfile[]) {
    const normalizedAccounts = normalizeSavedAccounts(accounts);
    savedAccountsRef.current = normalizedAccounts;
    setSavedAccounts(normalizedAccounts);
    const storage = getBrowserStorage();
    if (!storage) return;
    if (normalizedAccounts.length === 0) {
      storage.removeItem(ACCOUNT_SWITCHER_STORAGE_KEY);
      return;
    }
    storage.setItem(ACCOUNT_SWITCHER_STORAGE_KEY, JSON.stringify(normalizedAccounts));
  }

  function removeSavedAccount(accountId: number) {
    saveAccountProfiles(savedAccounts.filter((account) => account.id !== accountId));
  }

  function persistAuthState(nextToken: string, nextUser: UserInfo) {
    const storage = getBrowserStorage();
    storage?.removeItem('tag-token');
    storage?.setItem('tag-user', JSON.stringify(nextUser));
    saveAccountProfiles(upsertSavedAccount(savedAccountsRef.current, nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function clearAuthState(options?: { removeAccountId?: number; removeAllAccounts?: boolean }) {
    const storage = getBrowserStorage();
    storage?.removeItem('tag-token');
    storage?.removeItem('tag-user');
    if (options?.removeAllAccounts) {
      saveAccountProfiles([]);
    } else if (options?.removeAccountId) {
      removeSavedAccount(options.removeAccountId);
    }
    setToken('');
    setUser(null);
    setIsAccountMenuOpen(false);
  }

  async function generate() {
    setError('');
    setIsGenerating(true);
    try {
      const res = await apiFetch<Detail>('/accounts/generate?debug=1', token, {
        method: 'POST',
        body: JSON.stringify({ geoKey: selectedGeo, documentType: effectiveDocumentType, role: accountRole, persona, mailboxProvider }),
      });
      setDetail(res);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate identity');
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateBulk() {
    setError('');
    setIsBulkGenerating(true);
    try {
      const res = await apiFetch<{ items: Detail[] }>('/accounts/generate-bulk', token, {
        method: 'POST',
        body: JSON.stringify({ geoKey: selectedGeo, documentType: effectiveDocumentType, role: accountRole, persona, count: bulkCount, mailboxProvider }),
      });
      const firstItem = res.items[0] ?? null;
      setDetail(firstItem ? await apiFetch<Detail>(`/history/${firstItem.id}?debug=1`, token) : null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate identities');
    } finally {
      setIsBulkGenerating(false);
    }
  }

  async function loadDetail(id: number) {
    setDetail(await apiFetch<Detail>(`/history/${id}?debug=1`, token));
  }

  async function refreshInboxForDetail(waitMs = 0) {
    if (!detail) return;
    setIsRefreshingInbox(true);
    isRefreshingInboxRef.current = true;
    setInboxStatusLabel(waitMs > 0 ? 'Waiting for email' : 'Checking inbox');
    setError('');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/refresh-inbox?debug=1`, token, {
        method: 'POST',
        body: JSON.stringify({ waitMs }),
      });
      setDetail(updated);
      setInboxStatusLabel(updated.inbox.status === 'email_received' ? 'Email received' : 'No email found');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh inbox');
      setInboxStatusLabel('No email found');
    } finally {
      isRefreshingInboxRef.current = false;
      setIsRefreshingInbox(false);
    }
  }

  async function replaceMailboxForDetail() {
    if (!detail) return;
    const confirmed = window.confirm(locale === 'ru'
      ? 'Заменить почтовый ящик для этого профиля? Старый email перестанет совпадать с формами, куда его уже вставили.'
      : 'Replace mailbox for this identity? The old email will stop matching any registration form where it was already pasted.');
    if (!confirmed) return;
    setIsReplacingMailbox(true);
    setError('');
    setInboxStatusLabel('Replacing mailbox');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/replace-mailbox?debug=1`, token, {
        method: 'POST',
        body: JSON.stringify({ mailboxProvider }),
      });
      setDetail(updated);
      setInboxStatusLabel('Mailbox replaced');
      await refresh();
      await refreshUsage();
    } catch (err) {
      setInboxStatusLabel('Replace failed');
      setError(err instanceof Error ? err.message : 'Failed to replace mailbox');
    } finally {
      setIsReplacingMailbox(false);
    }
  }

  async function regeneratePhoneForDetail() {
    if (!detail) return;
    setIsRegeneratingPhone(true);
    setError('');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/regenerate-phone?debug=1`, token, { method: 'POST' });
      setDetail(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate phone');
    } finally {
      setIsRegeneratingPhone(false);
    }
  }

  async function createTemporaryMailbox() {
    setError('');
    setIsCreatingMailbox(true);
    try {
      const mailbox = await apiFetch<TempMailbox>('/mailboxes/create', token, {
        method: 'POST',
        body: JSON.stringify({ mailboxProvider }),
      });
      setTempMailbox(mailbox);
      setTempMailboxInbox(null);
      await refreshUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mailbox');
    } finally {
      setIsCreatingMailbox(false);
    }
  }

  async function refreshTemporaryMailbox(waitMs = 0) {
    if (!tempMailbox) return;
    setError('');
    setIsRefreshingTempMailbox(true);
    try {
      const inbox = await apiFetch<MailboxInbox>('/mailboxes/inbox', token, {
        method: 'POST',
        body: JSON.stringify({ ...tempMailbox, waitMs }),
      });
      setTempMailboxInbox(inbox);
      await refreshUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch mailbox inbox');
    } finally {
      setIsRefreshingTempMailbox(false);
    }
  }

  async function saveSiteAccountId() {
    if (!detail || siteAccountIdDraft.trim() === (detail.siteAccountId ?? '')) return;
    setError('');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/account-id?debug=1`, token, {
        method: 'PATCH',
        body: JSON.stringify({ siteAccountId: siteAccountIdDraft }),
      });
      setDetail(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account ID');
    }
  }

  async function savePhoneForDetail() {
    if (!detail || phoneDraft.trim() === (detail.phone ?? '')) return;
    setError('');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/phone?debug=1`, token, {
        method: 'PATCH',
        body: JSON.stringify({ phone: phoneDraft }),
      });
      setDetail(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save phone');
    }
  }

  async function saveBalanceStatus(id: number, balanceStatus: AccountBalanceStatus) {
    setError('');
    setSavingBalanceId(id);
    setHistory((items) => items.map((item) => item.id === id ? { ...item, balanceStatus } : item));
    if (detail?.id === id) {
      setDetail((current) => current ? { ...current, balanceStatus } : current);
    }
    try {
      const updated = await apiFetch<Detail>(`/history/${id}/balance-status?debug=1`, token, {
        method: 'PATCH',
        body: JSON.stringify({ balanceStatus }),
      });
      setHistory((items) => items.map((item) => item.id === id ? { ...item, balanceStatus: updated.balanceStatus } : item));
      if (detail?.id === id) {
        setDetail(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save balance status');
      void refresh();
      if (detail?.id === id) {
        void loadDetail(id);
      }
    } finally {
      setSavingBalanceId((current) => current === id ? null : current);
    }
  }

  async function saveSharing(id: number, sharedWithWorkspace: boolean) {
    setError('');
    setSavingSharingId(id);
    setHistory((items) => items.map((item) => item.id === id ? { ...item, sharedWithWorkspace } : item));
    if (detail?.id === id) {
      setDetail((current) => current ? { ...current, sharedWithWorkspace } : current);
    }
    try {
      const updated = await apiFetch<Detail>(`/history/${id}/sharing?debug=1`, token, {
        method: 'PATCH',
        body: JSON.stringify({ sharedWithWorkspace }),
      });
      setHistory((items) => items.map((item) => item.id === id ? {
        ...item,
        sharedWithWorkspace: updated.sharedWithWorkspace,
        sharedAt: updated.sharedAt,
      } : item));
      if (detail?.id === id) {
        setDetail(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sharing');
      void refresh();
      if (detail?.id === id) {
        void loadDetail(id);
      }
    } finally {
      setSavingSharingId((current) => current === id ? null : current);
    }
  }

  function clearAccountFilters() {
    setAccountSearch('');
    setStatusFilter('all');
    setBalanceFilter('all');
    setAccountGeoFilter('all');
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    window.setTimeout(() => setCopiedField((current) => current === key ? '' : current), 1500);
  }

  function copyIdentityPack() {
    if (!detail) return;
    const phoneForCopy = localPhoneDigits(detail.phone, detail.geoKey);
    const identityPack = [
      `Account ID: ${detail.siteAccountId || ''}`,
      `Balance Status: ${balanceStatusLabel(detail.balanceStatus, locale)}`,
      `Username: ${detail.username}`,
      `Email: ${detail.email}`,
      `Mailbox Password: ${detail.emailPassword}`,
      `First Name: ${detail.firstName}`,
      `Last Name: ${detail.lastName}`,
      `Date of Birth: ${detail.dateOfBirth}`,
      `Phone: ${phoneForCopy}`,
      `Sex: ${detail.gender}`,
      `Address: ${detail.addressLine}`,
      `City: ${detail.city}`,
      `Region: ${detail.region}`,
      `Country: ${detail.country}`,
      `Postal Code: ${detail.postalCode}`,
      `Place of Birth: ${detail.placeOfBirth}`,
      `Document Type: ${detail.documentType}`,
      `Document Value: ${detail.documentValue}`,
      `Issue Date: ${detail.documentIssueDate}`,
    ].join('\n');
    void copyValue(`identity-pack:${detail.id}`, identityPack);
  }

  function openActivationLink() {
    if (!activationLink) return;
    openSafeExternalLink(activationLink);
  }

  const generationSettingsPanel = (
    <section className="panel panel-generation accounts-settings bulk-card">
      <h3>{t('Generation panel')}</h3>
      <p>{locale === 'ru' ? 'Настройки для одного профиля и пакетной генерации.' : 'Defaults used by Generate identity and Generate bulk.'}</p>
      <div className="form-stack">
        <Field label="GEO">
          <select className="input-field compact" id="generation-geo" name="generationGeo" value={selectedGeo} onChange={(e) => selectGeo(e.target.value)}>
            {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </Field>
        <Field label={t('Form persona')}>
          <select className="input-field compact" id="generation-persona" name="generationPersona" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
            {PERSONAS.map((item) => <option key={item.value} value={item.value}>{tr(locale, item.label)}</option>)}
          </select>
        </Field>
        <Field label={t('Document type')}>
          <select className="input-field compact" id="generation-document-type" name="generationDocumentType" value={effectiveDocumentType} onChange={(e) => setDocumentType(e.target.value)}>
            {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="missing_rule_probe">missing_rule_probe</option>
          </select>
        </Field>
        <Field label={t('Mailbox provider')}>
          <select className="input-field compact" id="generation-mailbox-provider" name="generationMailboxProvider" value={mailboxProvider} onChange={(e) => selectMailboxProvider(e.target.value as MailboxProviderKey)}>
            {MAILBOX_PROVIDER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label={t('Bulk count')}>
          <input
            className="input-field compact"
            id="generation-bulk-count"
            name="generationBulkCount"
            type="number"
            min="1"
            max={maxBulkCount}
            value={bulkCount}
            onChange={(e) => setBulkCount(Math.min(maxBulkCount, Math.max(1, Number(e.target.value) || 1)))}
          />
        </Field>
      </div>
    </section>
  );

  if (!settingsReady) {
    return (
      <main className="auth-loading-shell" aria-label={t('Loading workspace')}>
        <div className="auth-loading-panel">
          <div className="sidebar-brand-mark">QA</div>
          <strong>{t('Test User Console')}</strong>
          <span>{t('Loading workspace')}</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={doLogin}>
          <div className="login-badge">{t('Internal QA console')}</div>
          <h1>{t('Test User Console')}</h1>
          <p>{locale === 'ru' ? 'Создавайте тестовые профили, копируйте регистрационные данные и проверяйте письма верификации.' : 'Generate test identities, copy registration data, and inspect mailbox verification.'}</p>
          <div className="login-fields">
            <input className="input-field" id="login" name="login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={t('login')} autoComplete="username" />
            <input className="input-field" id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('password')} type="password" autoComplete="current-password" />
          </div>
          {error ? <p className="alert alert-error">{error}</p> : null}
          <button className="primary-button w-full">{locale === 'ru' ? 'Войти' : 'Sign in'}</button>
          <Link className="login-helper-link" href="/register">{locale === 'ru' ? 'Есть invite token?' : 'Have an invite token?'}</Link>
        </form>
      </main>
    );
  }

  return (
    <main className={cn('console-shell', isSidebarOpen && 'is-sidebar-open')}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label={t('Close navigation')}
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside className="sidebar">
        <div className="sidebar-main">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">QA</div>
            <div>
              <strong>{t('Test User Console')}</strong>
              <span>{t('Identity generation workspace')}</span>
            </div>
          </div>

          <div className="flow-block">
            <div className="flow-label">{t('Workspace')}</div>
            <select
              className="workspace-switcher"
              id="workspace-switcher"
              name="workspaceSwitcher"
              value={user.workspaceId ?? ''}
              onChange={(event) => void switchWorkspace(Number(event.target.value))}
              disabled={isWorkspaceLoading}
              aria-label={t('Switch workspace')}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id} disabled={workspace.status === 'archived'}>
                  {workspace.name}{workspace.status === 'archived' ? ` (${locale === 'ru' ? 'архив' : 'archived'})` : ''}
                </option>
              ))}
            </select>
            <div className="flow-subtitle">{currentWorkspace?.memberCount ?? workspaceMembers.length} {t('users')} · {roleLabel(user.workspaceRole ?? 'member', locale)}</div>
            <span className={cn('flow-status', currentWorkspace?.status === 'archived' && 'is-archived')}>{workspaceStatusLabel(currentWorkspace?.status ?? 'active', locale)}</span>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={cn('sidebar-nav-item', activeNav === item.key && 'is-active')}
              >
                <span className="sidebar-nav-short">{item.short}</span>
                <span>{t(item.label)}</span>
                <span className="sidebar-count">
                  {item.key === 'main' ? ''
                    : item.key === 'accounts' ? history.length
                    : item.key === 'mailboxes' ? history.length
                      : item.key === 'form_data' ? recentCount
                        : item.key === 'codes' ? (detail?.inbox.codes.length ?? 0)
                          : ''}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-account-switcher">
            {isAccountMenuOpen ? (
              <div className="account-switch-menu" role="menu" aria-label={t('Switch account')}>
                <div className="account-switch-menu-head">
                  <strong>{t('Accounts')}</strong>
                  <span>{accountSwitcherAccounts.length} {t('saved')}</span>
                </div>
                <div className="account-switch-list">
                  {accountSwitcherAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      className={cn('account-switch-row', account.id === user.id && 'is-current')}
                      onClick={() => void switchAccount(account)}
                      disabled={switchingAccountId === account.id}
                      role="menuitem"
                    >
                      <span className="account-switch-avatar">{account.login.slice(0, 2).toUpperCase()}</span>
                      <span className="account-switch-copy">
                        <strong>{account.login}</strong>
                        <span>{account.id === user.id ? (locale === 'ru' ? 'Текущий' : 'Current') : roleLabel(account.role, locale)}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <form className="account-switch-form" onSubmit={addSwitchAccount}>
                  <input className="account-switch-input" id="switch-account-login" name="switchAccountLogin" value={switchLogin} onChange={(event) => setSwitchLogin(event.target.value)} placeholder={t('login')} autoComplete="username" />
                  <input className="account-switch-input" id="switch-account-password" name="switchAccountPassword" value={switchPassword} onChange={(event) => setSwitchPassword(event.target.value)} placeholder={t('password')} type="password" autoComplete="current-password" />
                  <button className="account-switch-submit" type="submit" disabled={isAddingAccount || !switchLogin.trim() || !switchPassword}>
                    {isAddingAccount ? t('Adding') : t('Add account')}
                  </button>
                </form>
              </div>
            ) : null}
            <div className="sidebar-user-card">
              <button className="sidebar-user-main" type="button" onClick={() => setIsAccountMenuOpen((value) => !value)} aria-label={t('Switch account')} aria-expanded={isAccountMenuOpen}>
                <span className="sidebar-user-copy">
                  <strong>{user.login}</strong>
                  <span>{roleLabel(user.role, locale)}</span>
                </span>
                <span className="sidebar-switch-icon" aria-hidden="true">
                  <MdiLightIcon path={mdilUnfoldMoreHorizontal} />
                </span>
              </button>
              <button className="sidebar-logout-button" type="button" onClick={() => void logout()} aria-label={t('Logout')}>
                <span className="sidebar-logout-icon" aria-hidden="true">
                  <MdiLightIcon path={mdilLogout} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <section className="workspace-shell">
        <div className="topbar">
          <div className="topbar-primary">
            <button
              type="button"
              className="mobile-menu-button"
              aria-label={t('Open navigation')}
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <div className="breadcrumb">
              <span>{t('Workspace')}</span>
              <span>{t('Test users')}</span>
              <strong>{t('Generation Console')}</strong>
            </div>
          </div>
          <div className="topbar-admin">
            {usageSummary ? <UsagePill label={t('Accounts')} used={usageSummary.limits.accountsPerDay.used} limit={usageSummary.limits.accountsPerDay.limit} /> : <SkeletonBox className="usage-pill-skeleton" />}
            <div className="topbar-chip workspace-chip" title={`${t('Current workspace')}: ${currentWorkspace?.name ?? t('Workspace')}`}>
              <span />
              <strong>{currentWorkspace?.name ?? t('Workspace')}</strong>
            </div>
            <div className="topbar-chip user-chip" title={locale === 'ru' ? `Вход: ${user.login}` : `Signed in as ${user.login}`}>{user.login}</div>
            <button className="logout-button" onClick={() => void logout()}>{t('Logout')}</button>
          </div>
        </div>

        {error ? <div className="alert alert-error slim">{error}</div> : null}
        {isGenerating ? <div className="alert alert-info slim">{locale === 'ru' ? 'Создаю почтовый ящик, учетные данные и первый снимок входящих.' : 'Creating mailbox, credentials, and first inbox snapshot.'}</div> : null}
        {isBulkGenerating ? <div className="alert alert-info slim">{locale === 'ru' ? `Создаю профили и почтовые снимки: ${bulkCount}.` : `Creating ${bulkCount} identities and mailbox snapshots.`}</div> : null}
        {activeNav === 'main' ? <AlertsPanel items={alertItems} locale={locale} /> : null}

        {showQuickActions ? (
          <section className="quick-actions-panel">
          <div className="quick-actions-title">{t('Quick actions')}</div>
          {usageSummary ? <UsageStrip usage={usageSummary} locale={locale} /> : <UsageStripSkeleton />}
          <div className="quick-actions-grid" aria-label={locale === 'ru' ? 'Основные действия с профилями' : 'Primary identity actions'}>
            <button className="action-card" onClick={generate} disabled={isGenerateDisabled} title="G">
              <span className="action-icon">+</span>
              <span><strong>{isGenerating ? (locale === 'ru' ? 'Создаю профиль' : 'Generating identity') : t('Generate identity')}</strong><small>{t('Single test user')}</small></span>
              <kbd>G</kbd>
            </button>
            <button className="action-card" onClick={generateBulk} disabled={isGenerateDisabled} title="B">
              <span className="action-icon">B</span>
              <span><strong>{isBulkGenerating ? (locale === 'ru' ? `Создаю: ${bulkCount}` : `Generating ${bulkCount}`) : t('Generate bulk')}</strong><small>{t('Multiple test users')}</small></span>
              <kbd>B</kbd>
            </button>
            <button className="action-card" onClick={() => refreshInboxForDetail(30000)} disabled={primaryActionsDisabled || isRefreshingInbox} title="R">
              <span className="action-icon">R</span>
              <span><strong>{isRefreshingInbox ? (locale === 'ru' ? 'Жду письмо' : 'Waiting for inbox') : t('Wait & refresh')}</strong><small>{locale === 'ru' ? 'Выбранный пользователь' : 'Selected test user'}</small></span>
              <kbd>R</kbd>
            </button>
            <button className="action-card" onClick={copyIdentityPack} disabled={primaryActionsDisabled}>
              <span className="action-icon">CP</span>
              <span><strong>{t('Copy pack')}</strong><small>{t('Registration data')}</small></span>
            </button>
          </div>
        </section>
        ) : null}

        <div className={cn('workspace-grid', activeNav === 'main' ? 'main-view' : activeNav === 'accounts' ? 'accounts-view' : 'single-view')}>
          {activeNav === 'main' ? (
          <>
          <div className="main-rail">
          {generationSettingsPanel}

          <section className="panel panel-list">
            <div className="panel-header">
              <h2>{locale === 'ru' ? 'Последние профили' : 'Recent identities'} <span>({history.length})</span></h2>
            </div>

            <div className="account-list">
              {isWorkspaceBootstrapping ? <ListSkeleton rows={6} /> : recentHistory.length ? recentHistory.map((item) => {
                const rowStatus = mapHistoryStatus(item);
                const selected = detail?.id === item.id;
                return (
                  <button key={item.id} type="button" className={cn('account-row', selected && 'is-selected')} onClick={() => loadDetail(item.id)}>
                    <span className={cn('badge status-marker', `tone-${statusTone(rowStatus)}`)} title={statusLabel(rowStatus, locale)} aria-label={statusLabel(rowStatus, locale)}>
                      <span className={cn('badge-dot', `tone-${statusTone(rowStatus)}`)} />
                    </span>
                    <strong>{item.siteAccountId || item.username}</strong>
                    <time>{formatCompactDate(item.createdAt)}</time>
                  </button>
                );
              }) : (
                <AccountsEmptyState
                  hasHistory={history.length > 0}
                  hasFilters={false}
                  onClearFilters={clearAccountFilters}
                  locale={locale}
                />
              )}
            </div>
            <Link className="view-all-button" href="/accounts">{t('View all test users')}</Link>
          </section>
          </div>

          <section className="panel panel-detail">
            <div className="panel-header">
              <h2>{t('Identity workspace')} {detail ? <span className={cn('badge', `tone-${statusTone(selectedStatus)}`)}>{statusLabel(selectedStatus, locale)}</span> : null}</h2>
            </div>

            {isWorkspaceBootstrapping && !detail ? (
              <IdentityWorkspaceSkeleton />
            ) : !detail ? (
              <div className="empty-workspace">
                <h3>{t('Generate an identity or open one from the list')}</h3>
                <p>{t('The selected test user appears here with registration data, mailbox, and verification.')}</p>
              </div>
            ) : (
              <div className="detail-stack">
                <section className="registration-form-grid">
                  <div className="form-section">
                    <h3>{t('Test user')}</h3>
                    <label className="account-id-field">
                      <span>{t('Account ID')}</span>
                      <div>
                        <input
                          className="input-field compact"
                          id={`site-account-id-${detail.id}`}
                          name="siteAccountId"
                          value={siteAccountIdDraft}
                          onBlur={saveSiteAccountId}
                          onChange={(e) => setSiteAccountIdDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder={locale === 'ru' ? 'Вставьте ID аккаунта' : 'Paste site account ID'}
                        />
                        <button className="micro-button" onClick={saveSiteAccountId} disabled={siteAccountIdDraft.trim() === (detail.siteAccountId ?? '')}>{t('Save')}</button>
                      </div>
                    </label>
                    <BalanceStatusField value={detail.balanceStatus} disabled={savingBalanceId === detail.id} locale={locale} onChange={(value) => void saveBalanceStatus(detail.id, value)} />
                    <SharingField
                      item={detail}
                      canManage={detail.createdByUserId === user.id}
                      isSaving={savingSharingId === detail.id}
                      onToggle={(shared) => void saveSharing(detail.id, shared)}
                      locale={locale}
                    />
                    <InspectorRow label={t('Password')} value={detail.emailPassword} hidden={!showPassword} onToggleHidden={() => setShowPassword((v) => !v)} onCopy={() => copyValue(`mailbox-password:${detail.id}`, detail.emailPassword)} copied={copiedField === `mailbox-password:${detail.id}`} sensitive locale={locale} />
                    <InspectorRow label={t('Username')} value={detail.username} onCopy={() => copyValue(`username:${detail.id}`, detail.username)} copied={copiedField === `username:${detail.id}`} locale={locale} />
                    <InspectorRow label={locale === 'ru' ? 'Дата регистрации' : 'Registration date'} value={formatDate(detail.createdAt)} onCopy={() => copyValue(`created:${detail.id}`, formatDate(detail.createdAt))} copied={copiedField === `created:${detail.id}`} locale={locale} />
                    <InspectorRow label={t('Mailbox provider')} value={mailboxProviderLabel(detail.mailboxProvider)} onCopy={() => copyValue(`mailbox-provider:${detail.id}`, mailboxProviderLabel(detail.mailboxProvider))} copied={copiedField === `mailbox-provider:${detail.id}`} locale={locale} />
                    <PhoneEditField
                      value={phoneDraft}
                      canEdit={detail.createdByUserId === user.id}
                      isSaving={phoneDraft.trim() !== (detail.phone ?? '')}
                      isRegenerating={isRegeneratingPhone}
                      onChange={setPhoneDraft}
                      onSave={() => void savePhoneForDetail()}
                      onRegenerate={() => void regeneratePhoneForDetail()}
                      onCopy={() => copyValue(`phone:${detail.id}`, localPhoneDigits(detail.phone, detail.geoKey))}
                      copied={copiedField === `phone:${detail.id}`}
                      locale={locale}
                    />
                    <RegistrationInfoField label="Email" value={detail.email} onCopy={() => copyValue(`email:${detail.id}`, detail.email)} copied={copiedField === `email:${detail.id}`} locale={locale} />
                    <MailboxControls
                      detail={detail}
                      statusLabel={inboxStatusLabel}
                      isRefreshing={isRefreshingInbox}
                      isReplacing={isReplacingMailbox}
                      canReplace={detail.createdByUserId === user.id}
                      onCheckNow={() => refreshInboxForDetail(0)}
                      onWaitRefresh={() => refreshInboxForDetail(30000)}
                      onReplace={() => void replaceMailboxForDetail()}
                      locale={locale}
                    />
                  </div>

                  <div className="form-section form-section-wide">
                    <h3>{t('Personal info')}</h3>
                    <PersonalInfoFields detail={detail} copiedField={copiedField} onCopy={copyValue} locale={locale} />
                  </div>
                </section>

                <section className="identity-pack">
                  <div className="identity-pack-header">
                    <h3>{t('Registration form data')}</h3>
                    <button className="micro-button" onClick={copyIdentityPack}>{t('Copy all')}</button>
                  </div>
                  <DatasetNotice quality={detail.documentQuality} locale={locale} />
                  <div className="identity-pack-grid">
                    <InfoTile label={t('Name fields')} value={`${detail.lastName}\n${detail.firstName}`} action={t('Copy')} onClick={() => copyValue(`names:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
                    <InfoTile label={t('Region fields')} value={`${detail.country}\n${detail.region}\n${detail.city}`} action={t('Copy')} onClick={() => copyValue(`region-pack:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
                    <InfoTile label={t('Document')} value={`${detail.documentType}\n${detail.documentValue}`} action={t('Copy')} onClick={() => copyValue(`doc-tile:${detail.id}`, `${detail.documentType}\n${detail.documentValue}`)} />
                    <InfoTile label={t('Phone')} value={detail.phone} action={t('Copy')} onClick={() => copyValue(`phone:${detail.id}`, localPhoneDigits(detail.phone, detail.geoKey))} />
                    <InfoTile label="Email" value={detail.email} action={t('Copy')} onClick={() => copyValue(`email:${detail.id}`, detail.email)} />
                  </div>
                </section>

                <EmailMessage
                  detail={detail}
                  activationLink={activationLink}
                  onActivate={openActivationLink}
                  onCopyEmail={() => copyValue(`email-message:${detail.id}`, detail.inbox.plainText || detail.inbox.subject || '')}
                  copied={copiedField === `email-message:${detail.id}`}
                  onWaitRefresh={() => refreshInboxForDetail(30000)}
                  isRefreshing={isRefreshingInbox}
                  locale={locale}
                />
              </div>
            )}
          </section>

          {hasVerificationCodes ? (
            <section className="panel panel-codes">
              <div className="panel-header">
                <h2>{t('Codes')} <span>({verificationCodes.length})</span></h2>
              </div>
              <div className="codes-list">
                {verificationCodes.map((code, index) => (
                <button key={`${code}:${index}`} type="button" className="code-row" onClick={() => copyValue(`code:${code}`, code)}>
                  <span>{index === 0 ? t('Email code') : t('SMS code')}</span>
                  <strong>{code}</strong>
                  <small>{copiedField === `code:${code}` ? t('Copied') : 'CP'}</small>
                  <time>{formatCompactDate(verificationReceivedAt)}</time>
                </button>
                ))}
              </div>
            </section>
          ) : null}
          </>
          ) : activeNav === 'accounts' ? (
          <>
          <section className="panel panel-list">
            <div className="panel-header accounts-header">
              <h2>{t('Test users')} <span className="count-badge">{history.length}</span></h2>
            </div>

            <div className="list-controls accounts-controls">
              <input className="input-field compact account-search-field" id="accounts-search" name="accountsSearch" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder={t('Search by user, email, GEO, or account ID')} />
              <div className="control-row accounts-filter-row">
                  <select className="input-field compact" id="accounts-status-filter" name="accountsStatusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | HistoryStatus)}>
                    <option value="all">{t('All statuses')}</option>
                    <option value="generated">{t('Generated')}</option>
                    <option value="email_received">{t('Email received')}</option>
                    <option value="waiting">{t('Waiting')}</option>
                  </select>
                  <select className="input-field compact" id="accounts-balance-filter" name="accountsBalanceFilter" value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value as 'all' | AccountBalanceStatus)}>
                    <option value="all">{t('All balances')}</option>
                    {BALANCE_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{balanceStatusLabel(item.value, locale)}</option>)}
                  </select>
                  <select className="input-field compact" id="accounts-geo-filter" name="accountsGeoFilter" value={accountGeoFilter} onChange={(e) => setAccountGeoFilter(e.target.value)}>
                    <option value="all">{t('All GEOs')}</option>
                    {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  <select className="input-field compact" id="accounts-sort-mode" name="accountsSortMode" value={sortMode} onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}>
                    <option value="newest">{t('Newest first')}</option>
                    <option value="oldest">{t('Oldest first')}</option>
                  </select>
              </div>
            </div>

            <div className="account-table-wrap">
              {isWorkspaceBootstrapping ? <TableSkeleton columns={8} rows={7} /> : filteredHistory.length ? (
                <table className="account-table">
                  <colgroup>
                    <col className="account-col-user" />
                    <col className="account-col-geo" />
                    <col className="account-col-email" />
                    <col className="account-col-status" />
                    <col className="account-col-balance" />
                    <col className="account-col-scope" />
                    <col className="account-col-created" />
                    <col className="account-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('Test user')}</th>
                      <th>GEO</th>
                      <th>Email</th>
                      <th>{t('Status')}</th>
                      <th>{t('Balance')}</th>
                      <th>{locale === 'ru' ? 'Доступ' : 'Scope'}</th>
                      <th>{locale === 'ru' ? 'Создано' : 'Created'}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item) => {
                      const rowStatus = mapHistoryStatus(item);
                      const selected = detail?.id === item.id;
                      return (
                        <tr key={item.id} className={cn(selected && 'is-selected', savingBalanceId === item.id && 'is-saving')}>
                          <td>
                            <strong>{item.siteAccountId || item.username}</strong>
                            <span>{item.firstName} {item.lastName}</span>
                          </td>
                          <td>{item.geoLabel}</td>
                          <td className="email-cell">{item.email}</td>
                          <td><span className={cn('badge', `tone-${statusTone(rowStatus)}`)} title={`${t('Status')}: ${statusLabel(rowStatus, locale)}`}>{statusLabel(rowStatus, locale)}</span></td>
                          <td>
                            <BalanceStatusSelect
                              value={item.balanceStatus}
                              disabled={savingBalanceId === item.id}
                              locale={locale}
                              onChange={(value) => void saveBalanceStatus(item.id, value)}
                            />
                          </td>
                          <td>
                            <span className={cn('badge', `tone-${scopeTone(item)}`)} title={isWorkspaceShared(item) ? t('Visible to workspace members') : t('Visible only to creator')}>{scopeLabel(item, locale)}</span>
                          </td>
                          <td>{formatCompactDate(item.createdAt)}</td>
                          <td><button type="button" className="micro-button" onClick={() => loadDetail(item.id)}>{t('Details')}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <AccountsEmptyState
                  hasHistory={history.length > 0}
                  hasFilters={hasActiveAccountFilters}
                  onClearFilters={clearAccountFilters}
                  locale={locale}
                />
              )}
            </div>
          </section>

          {detail && typeof document !== 'undefined' ? createPortal((
            <div className="account-detail-overlay" role="dialog" aria-modal="true" aria-label={t('Test user details')} onClick={() => setDetail(null)}>
              <section className="panel panel-detail account-detail-modal" onClick={(event) => event.stopPropagation()}>
                <div className="panel-header">
                  <h2>{t('Test user details')} <span className={cn('badge', `tone-${statusTone(selectedStatus)}`)}>{statusLabel(selectedStatus, locale)}</span></h2>
                  <button type="button" className="micro-button" onClick={() => setDetail(null)}>{t('Close')}</button>
                </div>

              <div className="detail-stack">
                <section className="registration-form-grid">
                  <div className="form-section">
                    <h3>{t('Test user')}</h3>
                    <label className="account-id-field">
                      <span>{t('Account ID')}</span>
                      <div>
                        <input
                          className="input-field compact"
                          id={`modal-site-account-id-${detail.id}`}
                          name="modalSiteAccountId"
                          value={siteAccountIdDraft}
                          onBlur={saveSiteAccountId}
                          onChange={(e) => setSiteAccountIdDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder={locale === 'ru' ? 'Вставьте ID аккаунта' : 'Paste site account ID'}
                        />
                        <button className="micro-button" onClick={saveSiteAccountId} disabled={siteAccountIdDraft.trim() === (detail.siteAccountId ?? '')}>{t('Save')}</button>
                      </div>
                    </label>
                    <BalanceStatusField value={detail.balanceStatus} disabled={savingBalanceId === detail.id} locale={locale} onChange={(value) => void saveBalanceStatus(detail.id, value)} />
                    <SharingField
                      item={detail}
                      canManage={detail.createdByUserId === user.id}
                      isSaving={savingSharingId === detail.id}
                      onToggle={(shared) => void saveSharing(detail.id, shared)}
                      locale={locale}
                    />
                    <InspectorRow label={t('Password')} value={detail.emailPassword} hidden={!showPassword} onToggleHidden={() => setShowPassword((v) => !v)} onCopy={() => copyValue(`mailbox-password:${detail.id}`, detail.emailPassword)} copied={copiedField === `mailbox-password:${detail.id}`} sensitive locale={locale} />
                    <InspectorRow label={t('Username')} value={detail.username} onCopy={() => copyValue(`username:${detail.id}`, detail.username)} copied={copiedField === `username:${detail.id}`} locale={locale} />
                    <InspectorRow label={locale === 'ru' ? 'Дата регистрации' : 'Registration date'} value={formatDate(detail.createdAt)} onCopy={() => copyValue(`created:${detail.id}`, formatDate(detail.createdAt))} copied={copiedField === `created:${detail.id}`} locale={locale} />
                    <PhoneEditField
                      value={phoneDraft}
                      canEdit={detail.createdByUserId === user.id}
                      isSaving={phoneDraft.trim() !== (detail.phone ?? '')}
                      isRegenerating={isRegeneratingPhone}
                      onChange={setPhoneDraft}
                      onSave={() => void savePhoneForDetail()}
                      onRegenerate={() => void regeneratePhoneForDetail()}
                      onCopy={() => copyValue(`phone:${detail.id}`, localPhoneDigits(detail.phone, detail.geoKey))}
                      copied={copiedField === `phone:${detail.id}`}
                      locale={locale}
                    />
                    <RegistrationInfoField label="Email" value={detail.email} onCopy={() => copyValue(`email:${detail.id}`, detail.email)} copied={copiedField === `email:${detail.id}`} locale={locale} />
                    <MailboxControls
                      detail={detail}
                      statusLabel={inboxStatusLabel}
                      isRefreshing={isRefreshingInbox}
                      isReplacing={isReplacingMailbox}
                      canReplace={detail.createdByUserId === user.id}
                      onCheckNow={() => refreshInboxForDetail(0)}
                      onWaitRefresh={() => refreshInboxForDetail(30000)}
                      onReplace={() => void replaceMailboxForDetail()}
                      locale={locale}
                    />
                  </div>

                  <div className="form-section form-section-wide">
                    <h3>{t('Personal info')}</h3>
                    <PersonalInfoFields detail={detail} copiedField={copiedField} onCopy={copyValue} locale={locale} />
                  </div>
                </section>

                <section className="identity-pack">
                  <div className="identity-pack-header">
                    <h3>{t('Registration form data')}</h3>
                    <button className="micro-button" onClick={copyIdentityPack}>{t('Copy all')}</button>
                  </div>
                  <DatasetNotice quality={detail.documentQuality} locale={locale} />
                  <div className="identity-pack-grid">
                    <InfoTile label={t('Name fields')} value={`${detail.lastName}\n${detail.firstName}`} action={t('Copy')} onClick={() => copyValue(`names:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
                    <InfoTile label={t('Region fields')} value={`${detail.country}\n${detail.region}\n${detail.city}`} action={t('Copy')} onClick={() => copyValue(`region-pack:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
                    <InfoTile label={t('Document')} value={`${detail.documentType}\n${detail.documentValue}`} action={t('Copy')} onClick={() => copyValue(`doc-tile:${detail.id}`, `${detail.documentType}\n${detail.documentValue}`)} />
                    <InfoTile label={t('Phone')} value={detail.phone} action={t('Copy')} onClick={() => copyValue(`phone:${detail.id}`, localPhoneDigits(detail.phone, detail.geoKey))} />
                    <InfoTile label="Email" value={detail.email} action={t('Copy')} onClick={() => copyValue(`email:${detail.id}`, detail.email)} />
                  </div>
                </section>

                <EmailMessage
                  detail={detail}
                  activationLink={activationLink}
                  onActivate={openActivationLink}
                  onCopyEmail={() => copyValue(`email-message:${detail.id}`, detail.inbox.plainText || detail.inbox.subject || '')}
                  copied={copiedField === `email-message:${detail.id}`}
                  onWaitRefresh={() => refreshInboxForDetail(30000)}
                  isRefreshing={isRefreshingInbox}
                  locale={locale}
                />
              </div>
              </section>
            </div>
          ), document.body) : null}

          {hasVerificationCodes ? (
            <section className="panel panel-codes">
              <div className="panel-header">
                <h2>{t('Codes')} <span>({verificationCodes.length})</span></h2>
              </div>
              <div className="codes-list">
                {verificationCodes.map((code, index) => (
                <button key={`${code}:${index}`} type="button" className="code-row" onClick={() => copyValue(`code:${code}`, code)}>
                  <span>{index === 0 ? t('Email code') : t('SMS code')}</span>
                  <strong>{code}</strong>
                  <small>{copiedField === `code:${code}` ? t('Copied') : 'CP'}</small>
                  <time>{formatCompactDate(verificationReceivedAt)}</time>
                </button>
                ))}
              </div>
            </section>
          ) : null}
          </>
          ) : (
            <UtilityView
              activeNav={activeNav}
              detail={detail}
              history={history}
              filteredHistory={filteredHistory}
              geoItems={geoItems}
              selectedGeo={selectedGeo}
              setSelectedGeo={selectGeo}
              currentGeo={currentGeo}
              documentType={effectiveDocumentType}
              setDocumentType={setDocumentType}
              persona={persona}
              setPersona={setPersona}
              accountRole={accountRole}
              setAccountRole={setAccountRole}
              bulkCount={bulkCount}
              setBulkCount={setBulkCount}
              tempMailbox={tempMailbox}
              tempMailboxInbox={tempMailboxInbox}
              isCreatingMailbox={isCreatingMailbox}
              isRefreshingTempMailbox={isRefreshingTempMailbox}
              onCreateMailbox={createTemporaryMailbox}
              onRefreshTempMailbox={refreshTemporaryMailbox}
              onRefreshInbox={(waitMs = 30000) => refreshInboxForDetail(waitMs)}
              isRefreshingInbox={isRefreshingInbox}
              onLoadDetail={loadDetail}
              onCopy={copyValue}
              copiedField={copiedField}
              usageSummary={usageSummary}
              userSettings={userSettings}
              workspaceSettings={workspaceSettings}
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              newWorkspaceName={newWorkspaceName}
              setNewWorkspaceName={setNewWorkspaceName}
              workspaceMembers={workspaceMembers}
              workspaceInvites={workspaceInvites}
              memberLookup={memberLookup}
              setMemberLookup={setMemberLookup}
              memberRole={memberRole}
              setMemberRole={setMemberRole}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              lastInviteToken={lastInviteToken}
              accountEmail={accountEmail}
              setAccountEmail={setAccountEmail}
              accountUsername={accountUsername}
              setAccountUsername={setAccountUsername}
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmNewPassword={confirmNewPassword}
              setConfirmNewPassword={setConfirmNewPassword}
              authSessions={authSessions}
              mailProviderStatus={mailProviderStatus}
              setWorkspaceSettings={setWorkspaceSettings}
              onSavePersonalSettings={savePersonalSettings}
              onSaveWorkspaceSettings={saveWorkspaceSettings}
              onCheckMailboxProviderHealth={checkMailboxProviderHealth}
              onCreateWorkspace={createNewWorkspace}
              onUpdateWorkspaceLifecycle={updateWorkspaceLifecycle}
              onAddMember={addMember}
              onUpdateMemberRole={updateMemberRole}
              onRemoveMember={removeMember}
              onCreateInvite={createInvite}
              onRevokeInvite={revokeInvite}
              onSaveAccountProfile={saveAccountProfile}
              onChangeAccountPassword={changeAccountPassword}
              onRevokeSession={revokeSession}
              onLogoutEverywhere={logoutEverywhere}
              isSavingSettings={isSavingSettings}
              isSavingAccount={isSavingAccount}
              settingsStatus={settingsStatus}
              accountStatus={accountStatus}
              canManageWorkspaceSettings={['owner', 'admin'].includes(user.workspaceRole ?? '')}
              isWorkspaceLoading={isWorkspaceBootstrapping}
              alertItems={alertItems}
              analyticsSummary={analyticsSummary}
              activityItems={activityItems}
              locale={locale}
              setLocale={setLocale}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
}

function SkeletonBox({ className }: { className?: string }) {
  return <span className={cn('skeleton-box', className)} aria-hidden="true" />;
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <SkeletonBox className="skeleton-dot" />
          <div>
            <SkeletonBox className="skeleton-line medium" />
            <SkeletonBox className="skeleton-line short" />
          </div>
          <SkeletonBox className="skeleton-line tiny" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <div className="skeleton-table" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="skeleton-table-row" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} key={rowIndex}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <SkeletonBox className={cn('skeleton-line', columnIndex === 0 && 'wide', columnIndex > 2 && 'short')} key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}

function UsageStripSkeleton() {
  return (
    <div className="usage-strip skeleton-usage" aria-label="Loading usage">
      <SkeletonBox className="skeleton-line medium" />
      <SkeletonBox className="skeleton-line medium" />
      <SkeletonBox className="skeleton-line medium" />
    </div>
  );
}

function IdentityWorkspaceSkeleton() {
  return (
    <div className="identity-workspace-skeleton" aria-label="Loading identity workspace">
      <div className="skeleton-form-grid">
        {Array.from({ length: 10 }).map((_, index) => (
          <div className="skeleton-field" key={index}>
            <SkeletonBox className="skeleton-line tiny" />
            <SkeletonBox className="skeleton-line wide" />
          </div>
        ))}
      </div>
      <UsageStripSkeleton />
      <InboxSkeleton />
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="inbox-skeleton" aria-label="Loading inbox">
      <SkeletonBox className="skeleton-line medium" />
      <SkeletonBox className="skeleton-line wide" />
      <SkeletonBox className="skeleton-block" />
    </div>
  );
}

function SettingsTabsSkeleton() {
  return (
    <div className="settings-tabs skeleton-settings-tabs" aria-label="Loading settings tabs">
      {Array.from({ length: 5 }).map((_, index) => <SkeletonBox className="skeleton-settings-tab" key={index} />)}
    </div>
  );
}

function SettingsSectionSkeleton() {
  return (
    <section className="settings-section settings-tab-panel" aria-label="Loading settings">
      <div className="section-subhead">
        <SkeletonBox className="skeleton-line medium" />
        <SkeletonBox className="skeleton-line wide" />
      </div>
      <div className="settings-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="skeleton-field" key={index}>
            <SkeletonBox className="skeleton-line tiny" />
            <SkeletonBox className="skeleton-input" />
          </div>
        ))}
      </div>
      <div className="settings-actions">
        <SkeletonBox className="skeleton-line medium" />
        <SkeletonBox className="skeleton-button" />
      </div>
    </section>
  );
}

function AlertsPanel({ items, locale = 'en' }: { items: AlertItem[]; locale?: Locale }) {
  if (!items.length) return null;

  return (
    <section className="alerts-panel" aria-label={tr(locale, 'Workspace alerts')}>
      {items.slice(0, 3).map((item) => {
        const copy = alertCopy(item, locale);
        return (
        <div key={item.id} className={cn('alert-card', `tone-${item.tone}`)}>
          <div>
            <strong>{copy.title}</strong>
            <span>{copy.message}</span>
          </div>
          {copy.metric ? <small>{copy.metric}</small> : null}
        </div>
      );
      })}
    </section>
  );
}

function DatasetNotice({ quality, locale = 'en' }: { quality: Detail['documentQuality']; locale?: Locale }) {
  const title = quality === 'verified'
    ? tr(locale, 'Verified format, synthetic data')
    : quality === 'missing_rules'
      ? tr(locale, 'Dataset rule missing')
      : tr(locale, 'Dataset under review');

  return (
    <div className={cn('dataset-notice', quality !== 'verified' && 'is-review')}>
      <strong>{title}</strong>
      <span>{tr(locale, 'Identity data is still being reviewed and may not be 100% accurate. Use it as test data only.')}</span>
    </div>
  );
}

function MailboxControls({
  detail,
  statusLabel: currentStatusLabel,
  isRefreshing,
  isReplacing,
  canReplace,
  onCheckNow,
  onWaitRefresh,
  onReplace,
  locale = 'en',
}: {
  detail: Detail;
  statusLabel: string;
  isRefreshing: boolean;
  isReplacing: boolean;
  canReplace: boolean;
  onCheckNow: () => void;
  onWaitRefresh: () => void;
  onReplace: () => void;
  locale?: Locale;
}) {
  const status = detail.inbox.status === 'email_received'
    ? tr(locale, 'Email received')
    : currentStatusLabel ? tr(locale, currentStatusLabel) : (locale === 'ru' ? 'Автопроверка до 5 минут после открытия' : 'Auto-checks for up to 5 min after opening');
  const retentionNote = detail.mailboxProvider === 'mail_gw'
    ? (locale === 'ru' ? 'mail.gw хранит письма по правилам провайдера' : 'mail.gw retention is provider-dependent')
    : (locale === 'ru' ? 'mail.tm хранит полученные письма 7 дней' : 'mail.tm keeps received mail for 7 days');

  return (
    <div className="mailbox-control-card">
      <div className="mailbox-control-meta">
        <span>{mailboxProviderLabel(detail.mailboxProvider)}</span>
        <strong>{status}</strong>
        <small>{retentionNote}</small>
      </div>
      <div className="mailbox-control-actions">
        <button type="button" className="micro-button" onClick={onCheckNow} disabled={isRefreshing || isReplacing}>{tr(locale, 'Check now')}</button>
        <button type="button" className="primary-button" onClick={onWaitRefresh} disabled={isRefreshing || isReplacing}>
          {isRefreshing ? tr(locale, 'Waiting') : tr(locale, 'Wait')}
        </button>
        <button
          type="button"
          className="micro-button danger-soft"
          onClick={onReplace}
          disabled={!canReplace || isRefreshing || isReplacing}
          title={canReplace ? (locale === 'ru' ? 'Создать новый почтовый ящик для этого профиля' : 'Create a new mailbox for this identity') : (locale === 'ru' ? 'Только создатель может заменить почтовый ящик' : 'Only the creator can replace this mailbox')}
        >
          {isReplacing ? tr(locale, 'Replacing') : tr(locale, 'Replace')}
        </button>
      </div>
    </div>
  );
}

function UtilityView({
  activeNav,
  detail,
  history,
  filteredHistory,
  geoItems,
  selectedGeo,
  setSelectedGeo,
  currentGeo,
  documentType,
  setDocumentType,
  persona,
  setPersona,
  accountRole,
  setAccountRole,
  bulkCount,
  setBulkCount,
  tempMailbox,
  tempMailboxInbox,
  isCreatingMailbox,
  isRefreshingTempMailbox,
  onCreateMailbox,
  onRefreshTempMailbox,
  onRefreshInbox,
  isRefreshingInbox,
  onLoadDetail,
  onCopy,
  copiedField,
  usageSummary,
  userSettings,
  workspaceSettings,
  workspaces,
  currentWorkspace,
  newWorkspaceName,
  setNewWorkspaceName,
  workspaceMembers,
  workspaceInvites,
  memberLookup,
  setMemberLookup,
  memberRole,
  setMemberRole,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  lastInviteToken,
  accountEmail,
  setAccountEmail,
  accountUsername,
  setAccountUsername,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmNewPassword,
  setConfirmNewPassword,
  authSessions,
  mailProviderStatus,
  setWorkspaceSettings,
  onSavePersonalSettings,
  onSaveWorkspaceSettings,
  onCheckMailboxProviderHealth,
  onCreateWorkspace,
  onUpdateWorkspaceLifecycle,
  onAddMember,
  onUpdateMemberRole,
  onRemoveMember,
  onCreateInvite,
  onRevokeInvite,
  onSaveAccountProfile,
  onChangeAccountPassword,
  onRevokeSession,
  onLogoutEverywhere,
  isSavingSettings,
  isSavingAccount,
  settingsStatus,
  accountStatus,
  canManageWorkspaceSettings,
  isWorkspaceLoading,
  alertItems,
  analyticsSummary,
  activityItems,
  locale,
  setLocale,
}: {
  activeNav: Exclude<NavKey, 'accounts'>;
  detail: Detail | null;
  history: HistoryItem[];
  filteredHistory: HistoryItem[];
  geoItems: GeoItem[];
  selectedGeo: string;
  setSelectedGeo: (value: string) => void;
  currentGeo?: GeoItem;
  documentType: string;
  setDocumentType: (value: string) => void;
  persona: PersonaKey;
  setPersona: (value: PersonaKey) => void;
  accountRole: 'admin' | 'user';
  setAccountRole: (value: 'admin' | 'user') => void;
  bulkCount: number;
  setBulkCount: (value: number) => void;
  tempMailbox: TempMailbox | null;
  tempMailboxInbox: MailboxInbox | null;
  isCreatingMailbox: boolean;
  isRefreshingTempMailbox: boolean;
  onCreateMailbox: () => void;
  onRefreshTempMailbox: (waitMs?: number) => void;
  onRefreshInbox: (waitMs?: number) => void;
  isRefreshingInbox: boolean;
  onLoadDetail: (id: number) => void;
  onCopy: (key: string, value: string) => void;
  copiedField: string;
  usageSummary: UsageSummary | null;
  userSettings: UserSettings | null;
  workspaceSettings: ServerWorkspaceSettings | null;
  workspaces: WorkspaceSummary[];
  currentWorkspace?: WorkspaceSummary;
  newWorkspaceName: string;
  setNewWorkspaceName: (value: string) => void;
  workspaceMembers: WorkspaceMember[];
  workspaceInvites: WorkspaceInvite[];
  memberLookup: string;
  setMemberLookup: (value: string) => void;
  memberRole: WorkspaceMember['workspaceRole'];
  setMemberRole: (value: WorkspaceMember['workspaceRole']) => void;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteRole: WorkspaceInvite['role'];
  setInviteRole: (value: WorkspaceInvite['role']) => void;
  lastInviteToken: string;
  accountEmail: string;
  setAccountEmail: (value: string) => void;
  accountUsername: string;
  setAccountUsername: (value: string) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmNewPassword: string;
  setConfirmNewPassword: (value: string) => void;
  authSessions: AuthSession[];
  mailProviderStatus: string;
  setWorkspaceSettings: (value: ServerWorkspaceSettings | null | ((current: ServerWorkspaceSettings | null) => ServerWorkspaceSettings | null)) => void;
  onSavePersonalSettings: () => void;
  onSaveWorkspaceSettings: () => void;
  onCheckMailboxProviderHealth: () => void;
  onCreateWorkspace: () => void;
  onUpdateWorkspaceLifecycle: (workspaceId: number, status: WorkspaceSummary['status']) => void;
  onAddMember: () => void;
  onUpdateMemberRole: (userId: number, role: WorkspaceMember['workspaceRole']) => void;
  onRemoveMember: (userId: number) => void;
  onCreateInvite: () => void;
  onRevokeInvite: (inviteId: number) => void;
  onSaveAccountProfile: () => void;
  onChangeAccountPassword: () => void;
  onRevokeSession: (sessionId: number) => void;
  onLogoutEverywhere: () => void;
  isSavingSettings: boolean;
  isSavingAccount: boolean;
  settingsStatus: string;
  accountStatus: string;
  canManageWorkspaceSettings: boolean;
  isWorkspaceLoading: boolean;
  alertItems: AlertItem[];
  analyticsSummary: AnalyticsSummary | null;
  activityItems: ActivityItem[];
  locale: Locale;
  setLocale: (value: Locale) => void;
}) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('defaults');
  const t = (text: string) => tr(locale, text);

  if (activeNav === 'mailboxes') {
    return (
      <section className="panel utility-panel">
        <div className="utility-header">
          <div>
            <h2>{t('Mailboxes')}</h2>
            <p>{locale === 'ru' ? 'Откройте почтовый ящик, посмотрите последнее письмо и скопируйте ссылки или коды верификации.' : 'Open a mailbox, inspect the latest message, and copy parsed verification links or codes.'}</p>
          </div>
          <button type="button" className="primary-button" onClick={onCreateMailbox} disabled={isCreatingMailbox}>
            {isCreatingMailbox ? t('Creating mailbox') : t('Create temporary mailbox')}
          </button>
        </div>

        <div className="mailboxes-layout">
          <section className="mailbox-reader">
            <div className="mailbox-reader-header">
              <div>
                <h3>{detail ? detail.email : tempMailbox ? tempMailbox.address : t('Inbox')}</h3>
                <p>{detail ? `${t('Test user')}: ${detail.siteAccountId || detail.username}` : tempMailbox ? (locale === 'ru' ? 'Отдельный временный ящик' : 'Standalone temporary mailbox') : (locale === 'ru' ? 'Откройте созданный ящик или создайте временный.' : 'Open a generated mailbox or create a temporary one.')}</p>
              </div>
              <div className="mailbox-reader-actions">
                {detail ? (
                  <>
                    <button type="button" className="micro-button" onClick={() => onRefreshInbox(0)} disabled={isRefreshingInbox}>
                      {t('Check now')}
                    </button>
                    <button type="button" className="primary-button" onClick={() => onRefreshInbox(30000)} disabled={isRefreshingInbox}>
                      {isRefreshingInbox ? t('Waiting') : t('Wait & refresh')}
                    </button>
                  </>
                ) : tempMailbox ? (
                  <>
                    <button type="button" className="micro-button" onClick={() => onRefreshTempMailbox(0)} disabled={isRefreshingTempMailbox}>
                      {t('Check now')}
                    </button>
                    <button type="button" className="primary-button" onClick={() => onRefreshTempMailbox(30000)} disabled={isRefreshingTempMailbox}>
                      {isRefreshingTempMailbox ? t('Waiting') : t('Wait & refresh')}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {isWorkspaceLoading && !detail && !tempMailbox ? (
              <InboxSkeleton />
            ) : detail ? (
              <EmailMessage
                detail={detail}
                activationLink={detail.inbox.primaryVerificationLink?.url ?? detail.inbox.links[0]?.url ?? ''}
                onActivate={() => {
                  const url = detail.inbox.primaryVerificationLink?.url ?? detail.inbox.links[0]?.url;
                  if (url) openSafeExternalLink(url);
                }}
                onCopyEmail={() => onCopy(`mailboxes-message:${detail.id}`, detail.inbox.plainText || detail.inbox.subject || '')}
                copied={copiedField === `mailboxes-message:${detail.id}`}
                onWaitRefresh={() => onRefreshInbox(30000)}
                isRefreshing={isRefreshingInbox}
                locale={locale}
              />
            ) : tempMailbox ? (
              <>
                <div className="mailbox-credentials">
                  <button type="button" onClick={() => onCopy('temp-mailbox-address', tempMailbox.address)}>
                    <span>Email</span>
                    <strong>{tempMailbox.address}</strong>
                    <small>{copiedField === 'temp-mailbox-address' ? t('Copied') : t('Copy')}</small>
                  </button>
                  <button type="button" onClick={() => onCopy('temp-mailbox-password', tempMailbox.password)}>
                    <span>{t('Password')}</span>
                    <strong>{tempMailbox.password}</strong>
                    <small>{copiedField === 'temp-mailbox-password' ? t('Copied') : t('Copy')}</small>
                  </button>
                </div>
                <StandaloneInbox inbox={tempMailboxInbox} address={tempMailbox.address} locale={locale} />
              </>
            ) : (
              <div className="email-empty-state">
                <strong>{locale === 'ru' ? 'Почтовый ящик не открыт' : 'No mailbox opened'}</strong>
                <span>{locale === 'ru' ? 'Нажмите "Открыть" в таблице ниже, чтобы посмотреть входящие этого ящика.' : 'Select `Open` in the table below to view that mailbox inbox here.'}</span>
              </div>
            )}
          </section>

          <div className="account-table-wrap mailboxes-table-wrap">
            {isWorkspaceLoading ? <TableSkeleton columns={5} rows={6} /> : (
            <table className="account-table mailboxes-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>{t('Test user')}</th>
                  <th>{t('Status')}</th>
                  <th>{locale === 'ru' ? 'Создано' : 'Created'}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const status = mapHistoryStatus(item);
                  return (
                    <tr key={item.id} className={cn(detail?.id === item.id && 'is-selected')}>
                      <td><strong>{item.email}</strong><span>{item.geoLabel}</span></td>
                      <td>{item.siteAccountId || item.username}</td>
	                      <td><span className={cn('badge', `tone-${statusTone(status)}`)}>{statusLabel(status, locale)}</span></td>
                      <td>{formatCompactDate(item.createdAt)}</td>
	                      <td><button type="button" className="micro-button" onClick={() => onLoadDetail(item.id)}>{t('Open')}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (activeNav === 'form_data') {
    return (
      <section className="panel utility-panel">
        <div className="utility-header">
          <div>
            <h2>{t('Registration form data')}</h2>
            <p>{locale === 'ru' ? 'Точные значения для вставки в целевую форму регистрации.' : 'Exact values to paste into the target registration form.'}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => detail ? onCopy(`form-data:${detail.id}`, detail.fullProfileText) : undefined} disabled={!detail}>
            {copiedField === `form-data:${detail?.id}` ? t('Copied') : t('Copy selected data')}
          </button>
        </div>

        <div className="settings-grid">
          <Field label={t('Default GEO')}>
            <select className="input-field compact" id="form-data-default-geo" name="formDataDefaultGeo" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
              {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Persona">
            <select className="input-field compact" id="form-data-persona" name="formDataPersona" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
              {PERSONAS.map((item) => <option key={item.value} value={item.value}>{tr(locale, item.label)}</option>)}
            </select>
          </Field>
          <Field label={t('Document type')}>
            <select className="input-field compact" id="form-data-document-type" name="formDataDocumentType" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              <option value="missing_rule_probe">missing_rule_probe</option>
            </select>
          </Field>
        </div>

        {detail ? (
          <div className="form-data-grid">
            <InfoTile label={t('Account ID')} value={detail.siteAccountId || (locale === 'ru' ? 'Не задан' : 'Not set')} action={t('Copy')} onClick={() => onCopy(`fd-account:${detail.id}`, detail.siteAccountId || '')} />
            <InfoTile label={t('First / last name')} value={`${detail.firstName}\n${detail.lastName}`} action={t('Copy')} onClick={() => onCopy(`fd-name:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
            <InfoTile label={t('Birth / sex')} value={`${detail.dateOfBirth}\n${detail.gender}`} action={t('Copy')} onClick={() => onCopy(`fd-birth:${detail.id}`, `${detail.dateOfBirth}\n${detail.gender}`)} />
            <InfoTile label={t('Country / region / city')} value={`${detail.country}\n${detail.region}\n${detail.city}`} action={t('Copy')} onClick={() => onCopy(`fd-geo:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
            <InfoTile label={t('Document')} value={`${detail.documentType}\n${detail.documentValue}\n${detail.documentIssueDate}`} action={t('Copy')} onClick={() => onCopy(`fd-doc:${detail.id}`, `${detail.documentType}\n${detail.documentValue}\n${detail.documentIssueDate}`)} />
            <InfoTile label={t('Contacts')} value={`${detail.email}\n${detail.phone}`} action={t('Copy')} onClick={() => onCopy(`fd-contact:${detail.id}`, `${detail.email}\n${localPhoneDigits(detail.phone, detail.geoKey)}`)} />
          </div>
        ) : (
          <div className="form-data-picker">
            <div className="section-subhead">
              <h3>{t('Select test user')}</h3>
              <p>{locale === 'ru' ? 'Откройте любого созданного тестового пользователя, чтобы увидеть точные регистрационные поля на этой странице.' : 'Open any generated test user to display its exact registration fields on this page.'}</p>
            </div>
            <div className="account-table-wrap">
              {isWorkspaceLoading ? <TableSkeleton columns={4} rows={6} /> : (
              <table className="account-table">
                <thead>
	                  <tr><th>{t('Test user')}</th><th>GEO</th><th>Email</th><th /></tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.siteAccountId || item.username}</strong><span>{item.firstName} {item.lastName}</span></td>
                      <td>{item.geoLabel}</td>
                      <td>{item.email}</td>
	                      <td><button type="button" className="micro-button" onClick={() => onLoadDetail(item.id)}>{t('Open data')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  if (activeNav === 'codes') {
    const codes = detail?.inbox.codes ?? [];
    const links = detail?.inbox.links ?? [];
    return (
      <section className="panel utility-panel">
        <div className="utility-header">
          <div>
            <h2>{t('Verification')}</h2>
            <p>{locale === 'ru' ? 'Коды и ссылки верификации для выбранного тестового пользователя.' : 'Codes and verification links for the selected test user.'}</p>
          </div>
          <span className={cn('badge', `tone-${statusTone(mapDetailStatus(detail))}`)}>{detail ? statusLabel(mapDetailStatus(detail), locale) : t('No test user selected')}</span>
        </div>

        {detail ? (
          <div className="verification-page-grid">
            <div>
              <h3>{t('Codes')}</h3>
              {codes.length ? codes.map((code, index) => (
                <button key={`${code}:${index}`} type="button" className="code-row" onClick={() => onCopy(`codes-page:${code}`, code)}>
	                  <span>{index === 0 ? t('Email code') : t('Code')}</span>
                  <strong>{code}</strong>
	                  <small>{copiedField === `codes-page:${code}` ? t('Copied') : 'CP'}</small>
                  <time>{formatCompactDate(detail.inbox.receivedAt)}</time>
                </button>
	              )) : <div className="empty-state compact">{t('No codes captured yet.')}</div>}
            </div>
            <div>
              <h3>{t('Links')}</h3>
              {links.length ? links.map((link) => (
                <button key={link.url} type="button" className="verification-link-card" onClick={() => onCopy(`codes-link:${link.url}`, link.url)}>
	                  <strong>{link.label || (link.isPrimary ? t('Primary verification link') : t('Verification link'))}</strong>
                  <span>{truncate(link.url, 92)}</span>
                </button>
	              )) : <div className="empty-state compact">{t('No links captured yet.')}</div>}
            </div>
          </div>
        ) : (
          <div className="account-table-wrap">
            {isWorkspaceLoading ? <TableSkeleton columns={4} rows={6} /> : (
            <table className="account-table">
              <thead>
	                <tr><th>{t('Test user')}</th><th>GEO</th><th>{t('Status')}</th><th /></tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.siteAccountId || item.username}</strong><span>{item.email}</span></td>
                    <td>{item.geoLabel}</td>
	                    <td><span className={cn('badge', `tone-${statusTone(mapHistoryStatus(item))}`)}>{statusLabel(mapHistoryStatus(item), locale)}</span></td>
	                    <td><button type="button" className="micro-button" onClick={() => onLoadDetail(item.id)}>{t('Open')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}
      </section>
    );
  }

  const editableWorkspaceSettings: ServerWorkspaceSettings = workspaceSettings ?? {
    historyRetentionDays: usageSummary?.settings.historyRetentionDays ?? 30,
    historyLimit: usageSummary?.settings.historyLimit ?? 50,
    allowBulkGeneration: usageSummary?.settings.allowBulkGeneration ?? true,
    maxBulkCount: usageSummary?.settings.maxBulkCount ?? 25,
    mailboxProvider: 'mail_tm',
    sharedAccountEditing: usageSummary?.settings.sharedAccountEditing === 'owner_admin' ? 'owner_admin' : 'creator_only',
    workspaceCreationPolicy: usageSummary?.settings.workspaceCreationPolicy === 'owner_admin' ? 'owner_admin' : 'active_users',
    accountsPerDay: usageSummary?.limits.accountsPerDay.limit ?? 25,
    mailboxCreatePerDay: usageSummary?.limits.mailboxesPerDay.limit ?? 25,
    inboxRefreshPerMinute: usageSummary?.limits.inboxRefreshPerMinute.limit ?? 10,
  };
  const updateWorkspaceDraft = (patch: Partial<ServerWorkspaceSettings>) => {
    setWorkspaceSettings((current) => ({ ...editableWorkspaceSettings, ...current, ...patch }));
  };
  const inviteLink = lastInviteToken && typeof window !== 'undefined'
    ? `${window.location.origin}/invite?token=${encodeURIComponent(lastInviteToken)}`
    : '';
  const pendingInviteCount = workspaceInvites.filter((invite) => invite.status === 'pending').length;
  const activeWorkspaceCount = workspaces.filter((workspace) => workspace.status === 'active').length;
  const settingsTabs = buildSettingsTabs({
    bulkCount,
    workspaceName: currentWorkspace?.name,
    inviteCount: pendingInviteCount,
    memberCount: workspaceMembers.length,
    activeSessionCount: authSessions.length,
    generated24h: analyticsSummary?.totals.generated24h ?? 0,
    activityCount: activityItems.length,
    locale,
  });

  return (
    <section className="panel utility-panel">
      <div className="utility-header settings-header">
        <div>
          <h2>{t('Settings')}</h2>
          <p>{locale === 'ru' ? 'Личные настройки, лимиты рабочей области, доступ и безопасность аккаунта сгруппированы по задачам.' : 'Defaults, workspace limits, access, and account security are grouped by task.'}</p>
        </div>
        <span className={cn('badge', settingsStatus === 'Save failed' ? 'tone-warning' : 'tone-success')}>{t(settingsStatus)}</span>
      </div>

      {isWorkspaceLoading ? <SettingsTabsSkeleton /> : (
      <div className="settings-tabs" role="tablist" aria-label={locale === 'ru' ? 'Разделы настроек' : 'Settings sections'}>
        {settingsTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={settingsTab === tab.key}
            className={cn('settings-tab', settingsTab === tab.key && 'is-active')}
            onClick={() => setSettingsTab(tab.key)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.meta}</span>
          </button>
        ))}
      </div>
      )}

      {isWorkspaceLoading && !userSettings ? (
      <SettingsSectionSkeleton />
      ) : settingsTab === 'defaults' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Generation Defaults')}</h3>
          <p>{t('Your preferred GEO, persona, document type, and bulk count for new test users.')}</p>
        </div>
        <div className="settings-grid">
          <Field label={t('Default GEO')}>
            <select className="input-field compact" id="settings-default-geo" name="settingsDefaultGeo" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
              {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </Field>
          <Field label={t('Default persona')}>
            <select className="input-field compact" id="settings-default-persona" name="settingsDefaultPersona" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
              {PERSONAS.map((item) => <option key={item.value} value={item.value}>{tr(locale, item.label)}</option>)}
            </select>
          </Field>
          <Field label={t('Default document')}>
            <select className="input-field compact" id="settings-default-document" name="settingsDefaultDocument" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              <option value="missing_rule_probe">missing_rule_probe</option>
            </select>
          </Field>
          <Field label={t('Bulk count')}>
            <input className="input-field compact" id="settings-bulk-count" name="settingsBulkCount" type="number" min="1" max={usageSummary?.settings.maxBulkCount ?? 25} value={bulkCount} onChange={(e) => setBulkCount(Math.min(usageSummary?.settings.maxBulkCount ?? 25, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
        </div>
        <div className="settings-actions">
          <span>{userSettings ? (locale === 'ru' ? `На сервере: ${userSettings.defaultGeo} / ${userSettings.defaultDocumentType} / ${userSettings.locale}` : `Server default: ${userSettings.defaultGeo} / ${userSettings.defaultDocumentType} / ${userSettings.locale}`) : (locale === 'ru' ? 'Серверные настройки загружаются' : 'Server defaults loading')}</span>
          <button type="button" className="primary-button" onClick={onSavePersonalSettings} disabled={isSavingSettings}>
            {isSavingSettings ? t('Saving') : t('Save personal settings')}
          </button>
        </div>
      </section>
      ) : null}

      {settingsTab === 'workspace' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Workspace Limits')}</h3>
          <p>{locale === 'ru' ? 'Общее хранение, лимиты провайдеров и настройки пакетной генерации для рабочей области.' : 'Shared retention, provider limits, and bulk-generation controls for the workspace.'}</p>
        </div>
        <div className="workspace-create-row">
          <div>
            <strong>{currentWorkspace?.name ?? t('Current workspace')}</strong>
            <span>{locale === 'ru' ? `Доступно рабочих областей: ${workspaces.length} · роль: ${roleLabel(currentWorkspace?.workspaceRole ?? 'member', locale)}` : `${workspaces.length} workspaces available · active role ${currentWorkspace?.workspaceRole ?? 'member'}`}</span>
          </div>
          <input
            className="input-field compact"
            id="new-workspace-name"
            name="newWorkspaceName"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder={t('New workspace name')}
          />
          <button type="button" className="primary-button" onClick={onCreateWorkspace} disabled={isSavingSettings || !newWorkspaceName.trim()}>
            {t('Create workspace')}
          </button>
        </div>
        <div className="members-table-wrap workspace-lifecycle-wrap">
          <table className="account-table members-table workspace-lifecycle-table">
            <thead>
              <tr>
                <th>{t('Workspace')}</th>
                <th>{t('Status')}</th>
                <th>{t('Role')}</th>
                <th>{t('Users')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => {
                const isActive = workspace.status === 'active';
                const isOwner = workspace.workspaceRole === 'owner';
                const disablesLastActive = isActive && activeWorkspaceCount <= 1;
                return (
                  <tr key={workspace.id}>
                    <td>
                      <strong>{workspace.name}</strong>
                      <span>{workspace.id === currentWorkspace?.id ? t('Current workspace') : (locale === 'ru' ? `Обновлено ${formatCompactDate(workspace.updatedAt)}` : `Updated ${formatCompactDate(workspace.updatedAt)}`)}</span>
                    </td>
                    <td><span className={cn('badge', isActive ? 'tone-success' : 'tone-warning')}>{workspaceStatusLabel(workspace.status, locale)}</span></td>
                    <td><span className={cn('badge', `tone-${roleTone(workspace.workspaceRole)}`)} title={`${t('Workspace role')}: ${roleLabel(workspace.workspaceRole, locale)}`}>{roleLabel(workspace.workspaceRole, locale)}</span></td>
                    <td>{workspace.memberCount}</td>
                    <td>
                      <button
                        type="button"
                        className="micro-button"
                        onClick={() => onUpdateWorkspaceLifecycle(workspace.id, isActive ? 'archived' : 'active')}
                        disabled={isSavingSettings || !isOwner || disablesLastActive}
                      >
                        {isActive ? t('Archive') : t('Restore')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="settings-grid">
          <Field label={t('History retention days')}>
            <input className="input-field compact" id="history-retention-days" name="historyRetentionDays" type="number" min="1" max="3650" value={editableWorkspaceSettings.historyRetentionDays} onChange={(e) => updateWorkspaceDraft({ historyRetentionDays: Number(e.target.value) || 1 })} />
          </Field>
          <Field label={t('History limit')}>
            <input className="input-field compact" id="history-limit" name="historyLimit" type="number" min="1" max="1000" value={editableWorkspaceSettings.historyLimit} onChange={(e) => updateWorkspaceDraft({ historyLimit: Number(e.target.value) || 1 })} />
          </Field>
          <Field label={t('Max bulk count')}>
            <input className="input-field compact" id="max-bulk-count" name="maxBulkCount" type="number" min="1" max="100" value={editableWorkspaceSettings.maxBulkCount} onChange={(e) => updateWorkspaceDraft({ maxBulkCount: Number(e.target.value) || 1 })} />
          </Field>
          <Field label={t('Mailbox provider')}>
            <select className="input-field compact" id="workspace-mailbox-provider" name="workspaceMailboxProvider" value={editableWorkspaceSettings.mailboxProvider} onChange={(e) => updateWorkspaceDraft({ mailboxProvider: e.target.value as ServerWorkspaceSettings['mailboxProvider'] })}>
              <option value="mail_tm">mail.tm</option>
              <option value="mail_gw">mail.gw</option>
              <option value="mail_tm_mail_gw_fallback">mail.tm → mail.gw fallback</option>
            </select>
          </Field>
          <Field label={t('Shared account editing')}>
            <select className="input-field compact" id="shared-account-editing" name="sharedAccountEditing" value={editableWorkspaceSettings.sharedAccountEditing} onChange={(e) => updateWorkspaceDraft({ sharedAccountEditing: e.target.value as ServerWorkspaceSettings['sharedAccountEditing'] })}>
              <option value="creator_only">{t('Creator only')}</option>
              <option value="owner_admin">{t('Owner/admin can edit shared')}</option>
            </select>
          </Field>
          <Field label={t('Workspace creation')}>
            <select className="input-field compact" id="workspace-creation-policy" name="workspaceCreationPolicy" value={editableWorkspaceSettings.workspaceCreationPolicy} onChange={(e) => updateWorkspaceDraft({ workspaceCreationPolicy: e.target.value as ServerWorkspaceSettings['workspaceCreationPolicy'] })}>
              <option value="active_users">{t('Any active user')}</option>
              <option value="owner_admin">{t('Current owner/admin only')}</option>
            </select>
          </Field>
          <label className="settings-toggle">
            <input id="allow-bulk-generation" name="allowBulkGeneration" type="checkbox" checked={editableWorkspaceSettings.allowBulkGeneration} onChange={(e) => updateWorkspaceDraft({ allowBulkGeneration: e.target.checked })} />
            <span>{t('Allow bulk generation')}</span>
          </label>
        </div>
        <div className="settings-grid quota-grid">
          <Field label={t('Accounts per day')}>
            <input className="input-field compact" id="accounts-per-day" name="accountsPerDay" type="number" min="0" max="10000" value={editableWorkspaceSettings.accountsPerDay} onChange={(e) => updateWorkspaceDraft({ accountsPerDay: Number(e.target.value) || 0 })} />
          </Field>
          <Field label={t('Mailboxes per day')}>
            <input className="input-field compact" id="mailboxes-per-day" name="mailboxesPerDay" type="number" min="0" max="10000" value={editableWorkspaceSettings.mailboxCreatePerDay} onChange={(e) => updateWorkspaceDraft({ mailboxCreatePerDay: Number(e.target.value) || 0 })} />
          </Field>
          <Field label={t('Inbox refresh per minute')}>
            <input className="input-field compact" id="inbox-refresh-per-minute" name="inboxRefreshPerMinute" type="number" min="0" max="1000" value={editableWorkspaceSettings.inboxRefreshPerMinute} onChange={(e) => updateWorkspaceDraft({ inboxRefreshPerMinute: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        {usageSummary ? <UsageStrip usage={usageSummary} locale={locale} /> : null}
        <div className="settings-actions">
          <span>{mailProviderStatus}</span>
          <button type="button" className="secondary-button" onClick={onCheckMailboxProviderHealth} disabled={isSavingSettings || !canManageWorkspaceSettings}>
            {t('Check mailbox provider')}
          </button>
        </div>
        <div className="settings-actions">
          <span>{canManageWorkspaceSettings ? t('Applies to everyone in this workspace.') : t('Workspace settings require owner or admin access.')}</span>
          <button type="button" className="primary-button" onClick={onSaveWorkspaceSettings} disabled={isSavingSettings || !workspaceSettings || !canManageWorkspaceSettings}>
            {isSavingSettings ? t('Saving') : t('Save workspace settings')}
          </button>
        </div>
      </section>
      ) : null}

      {settingsTab === 'invites' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Invites')}</h3>
          <p>{t('Create invite-only registration links and revoke pending access.')}</p>
        </div>

        <div className="member-add-row invite-create-row">
          <input
            className="input-field compact"
            id="invite-email"
            name="inviteEmail"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={t('email for invite')}
            disabled={!canManageWorkspaceSettings}
          />
          <select className={cn('input-field compact badge-select role-select', `tone-${roleTone(inviteRole)}`)} id="invite-role" name="inviteRole" value={inviteRole} title={`${t('Role')}: ${roleLabel(inviteRole, locale)}`} onChange={(e) => setInviteRole(e.target.value as WorkspaceInvite['role'])} disabled={!canManageWorkspaceSettings}>
            <option value="member">{roleLabel('member', locale)}</option>
            <option value="viewer">{roleLabel('viewer', locale)}</option>
            <option value="admin">{roleLabel('admin', locale)}</option>
          </select>
          <button type="button" className="primary-button" onClick={onCreateInvite} disabled={isSavingSettings || !canManageWorkspaceSettings}>{t('Create invite')}</button>
        </div>

        {lastInviteToken ? (
          <div className="invite-token-box">
            <span>{t('Invite link')}</span>
            <code>{inviteLink || lastInviteToken}</code>
            <button type="button" className="micro-button" onClick={() => onCopy('invite-link', inviteLink || lastInviteToken)}>
              {copiedField === 'invite-link' ? t('Copied') : t('Copy')}
            </button>
          </div>
        ) : null}

        <div className="members-table-wrap">
          <table className="account-table members-table">
            <thead>
              <tr>
                <th>{t('Invite')}</th>
                <th>{t('Role')}</th>
                <th>{t('Status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workspaceInvites.map((invite) => (
                <tr key={invite.id}>
                  <td><strong>{invite.email || t('Open invite')}</strong><span>{t('Expires')} {formatCompactDate(invite.expiresAt)}</span></td>
                  <td><span className={cn('badge', `tone-${roleTone(invite.role)}`)} title={`${t('Role')}: ${roleLabel(invite.role, locale)}`}>{roleLabel(invite.role, locale)}</span></td>
                  <td>
                    <span className={cn('badge', `tone-${inviteStatusTone(invite.status)}`)}>{invite.status}</span>
                    {invite.acceptedByLogin ? <span>{locale === 'ru' ? `принял ${invite.acceptedByLogin}` : `by ${invite.acceptedByLogin}`}</span> : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="micro-button"
                      onClick={() => onRevokeInvite(invite.id)}
                      disabled={!canManageWorkspaceSettings || isSavingSettings || invite.status !== 'pending'}
                    >
                      {t('Revoke')}
                    </button>
                  </td>
                </tr>
              ))}
              {workspaceInvites.length === 0 ? (
                <tr>
                  <td colSpan={4}>{locale === 'ru' ? 'Инвайтов пока нет' : 'No invites yet'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="settings-actions">
          <span>{canManageWorkspaceSettings ? t('Invite links create new users directly inside this workspace.') : t('Invite management requires owner or admin access.')}</span>
        </div>
      </section>
      ) : null}

      {settingsTab === 'team' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Team Members')}</h3>
          <p>{t('Add existing users to the workspace and adjust their access level.')}</p>
        </div>

        <div className="member-add-row">
          <input
            className="input-field compact"
            id="member-lookup"
            name="memberLookup"
            value={memberLookup}
            onChange={(e) => setMemberLookup(e.target.value)}
            placeholder={t('login, email, or username')}
            disabled={!canManageWorkspaceSettings}
          />
          <select className={cn('input-field compact badge-select role-select', `tone-${roleTone(memberRole)}`)} id="member-role" name="memberRole" value={memberRole} title={`${t('Workspace role')}: ${roleLabel(memberRole, locale)}`} onChange={(e) => setMemberRole(e.target.value as WorkspaceMember['workspaceRole'])} disabled={!canManageWorkspaceSettings}>
            <option value="member">{roleLabel('member', locale)}</option>
            <option value="viewer">{roleLabel('viewer', locale)}</option>
            <option value="admin">{roleLabel('admin', locale)}</option>
            <option value="owner">{roleLabel('owner', locale)}</option>
          </select>
          <button type="button" className="primary-button" onClick={onAddMember} disabled={isSavingSettings || !memberLookup.trim() || !canManageWorkspaceSettings}>{t('Add member')}</button>
        </div>

        <div className="members-table-wrap">
          <table className="account-table members-table">
            <thead>
              <tr>
                <th>{t('User')}</th>
                <th>{t('Workspace role')}</th>
                <th>{t('System role')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workspaceMembers.map((member) => (
                <tr key={member.userId}>
                  <td><strong>{member.login}</strong><span>{member.email || member.username}</span></td>
                  <td>
                    <select
                      className={cn('input-field compact badge-select role-select', `tone-${roleTone(member.workspaceRole)}`)}
                      id={`member-role-${member.userId}`}
                      name={`memberRole-${member.userId}`}
                      value={member.workspaceRole}
                      title={`${t('Workspace role')}: ${roleLabel(member.workspaceRole, locale)}`}
                      onChange={(e) => onUpdateMemberRole(member.userId, e.target.value as WorkspaceMember['workspaceRole'])}
                      disabled={!canManageWorkspaceSettings || isSavingSettings}
                    >
                      <option value="owner">{roleLabel('owner', locale)}</option>
                      <option value="admin">{roleLabel('admin', locale)}</option>
                      <option value="member">{roleLabel('member', locale)}</option>
                      <option value="viewer">{roleLabel('viewer', locale)}</option>
                    </select>
                  </td>
                  <td><span className={cn('badge', `tone-${roleTone(member.userRole)}`)} title={`${t('System role')}: ${roleLabel(member.userRole, locale)}`}>{roleLabel(member.userRole, locale)}</span></td>
                  <td><button type="button" className="micro-button" onClick={() => onRemoveMember(member.userId)} disabled={!canManageWorkspaceSettings || isSavingSettings}>{t('Remove')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="settings-actions">
          <span>{canManageWorkspaceSettings ? (locale === 'ru' ? 'Инвайты создают новых пользователей; кнопка "Добавить участника" привязывает существующего.' : 'Invites create new users; add member attaches an existing user.') : t('Member management requires owner or admin access.')}</span>
        </div>
      </section>
      ) : null}

      {settingsTab === 'security' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Account Security')}</h3>
          <p>{locale === 'ru' ? 'Email, имя пользователя, пароль и активные сессии вашего аккаунта.' : 'Email, username, password, and active sessions for your user account.'}</p>
        </div>

        <div className="settings-grid account-settings-grid">
          <Field label="Email">
            <input className="input-field compact" id="account-email" name="accountEmail" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="email" autoComplete="email" />
          </Field>
          <Field label={t('Username')}>
            <input className="input-field compact" id="account-username" name="accountUsername" value={accountUsername} onChange={(event) => setAccountUsername(event.target.value)} placeholder="username" autoComplete="username" />
          </Field>
          <Field label={t('Interface language')}>
            <select className="input-field compact" id="account-interface-language" name="accountInterfaceLanguage" value={locale} onChange={(e) => setLocale(normalizeLocale(e.target.value))}>
              {LOCALE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="settings-actions">
          <span>{t(accountStatus)}</span>
          <button type="button" className="primary-button" onClick={onSaveAccountProfile} disabled={isSavingAccount || !accountEmail.trim() || !accountUsername.trim()}>
            {isSavingAccount ? t('Saving') : t('Save profile')}
          </button>
        </div>

        <div className="settings-grid password-settings-grid">
          <Field label={t('Current password')}>
            <input className="input-field compact" id="current-password" name="currentPassword" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={t('New password')}>
            <input className="input-field compact" id="new-password" name="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t('Confirm new password')}>
            <input className="input-field compact" id="confirm-new-password" name="confirmNewPassword" type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="settings-actions">
          <span>{t('Changing password revokes other active sessions.')}</span>
          <button type="button" className="primary-button" onClick={onChangeAccountPassword} disabled={isSavingAccount || !currentPassword || !newPassword || !confirmNewPassword}>
            {isSavingAccount ? t('Saving') : t('Change password')}
          </button>
        </div>

        <div className="members-table-wrap">
          <table className="account-table sessions-table">
            <thead>
              <tr>
                <th>{t('Session')}</th>
                <th>IP</th>
                <th>{t('Last seen')}</th>
                <th>{t('Expires')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {authSessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.isCurrent ? t('Current session') : t('Active session')}</strong><span>{session.userAgent || t('Unknown client')}</span></td>
                  <td>{session.ipAddress || '—'}</td>
                  <td>{formatCompactDate(session.lastSeenAt || session.createdAt)}</td>
                  <td>{formatCompactDate(session.expiresAt)}</td>
                  <td>
                    <button type="button" className="micro-button" onClick={() => onRevokeSession(session.id)} disabled={isSavingAccount}>
                      {session.isCurrent ? t('Logout') : t('Revoke')}
                    </button>
                  </td>
                </tr>
              ))}
              {authSessions.length === 0 ? (
                <tr>
                  <td colSpan={5}>{t('No active sessions')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="settings-actions danger-actions">
          <span>{t('Revokes every active session for this account, including this browser.')}</span>
          <button type="button" className="secondary-button danger-button" onClick={onLogoutEverywhere} disabled={isSavingAccount}>{t('Logout everywhere')}</button>
        </div>
      </section>
      ) : null}

      {settingsTab === 'analytics' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Workspace Analytics')}</h3>
          <p>{locale === 'ru' ? 'Операционные счетчики генерации, почтовых ящиков и проверок входящих.' : 'Operational counters from local generation, mailbox, and inbox usage events.'}</p>
        </div>

        {analyticsSummary ? (
          <>
            <div className="analytics-metric-grid">
              <Metric label={t('Generated 7d')} value={String(analyticsSummary.totals.generatedTotal)} />
              <Metric label={t('Generated 24h')} value={String(analyticsSummary.totals.generated24h)} />
              <Metric label={t('Email received')} value={String(analyticsSummary.totals.emailReceived)} />
              <Metric label={t('Verified docs')} value={String(analyticsSummary.totals.verifiedDocuments)} />
              <Metric label={t('Review docs')} value={String(analyticsSummary.totals.reviewDocuments)} />
            </div>

            <div className="analytics-grid">
              <section className="analytics-card">
                <h4>{t('Usage events')}</h4>
                {analyticsSummary.usageByDay.length ? analyticsSummary.usageByDay.map((item) => (
                  <div key={`${item.day}:${item.eventType}`} className="analytics-row">
                    <span>{item.day}</span>
                    <strong>{activityEventLabel(item.eventType, locale)}</strong>
                    <small>{item.total}</small>
                  </div>
                )) : <div className="empty-state compact">{t('No usage events yet.')}</div>}
              </section>

              <section className="analytics-card">
                <h4>{t('Top GEOs')}</h4>
                {analyticsSummary.topGeos.length ? analyticsSummary.topGeos.map((item) => (
                  <div key={item.geoKey} className="analytics-row">
                    <span>{item.geoLabel}</span>
                    <strong>{item.geoKey}</strong>
                    <small>{item.count}</small>
                  </div>
                )) : <div className="empty-state compact">{t('No generated GEOs yet.')}</div>}
              </section>
            </div>
          </>
        ) : <SettingsSectionSkeleton />}

        <div className="section-subhead">
          <h3>{t('Active Alerts')}</h3>
          <p>{locale === 'ru' ? 'Лимиты и предупреждения датасета из текущего состояния рабочей области.' : 'Limit and dataset warnings generated from the current workspace state.'}</p>
        </div>
        {alertItems.length ? <AlertsPanel items={alertItems} locale={locale} /> : <div className="empty-state compact">{t('No active alerts.')}</div>}
      </section>
      ) : null}

      {settingsTab === 'activity' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>{t('Activity Log')}</h3>
          <p>{locale === 'ru' ? 'Действия рабочей области: генерация, доступ, инвайты, участники и сессии.' : 'Workspace actions across generation, sharing, invites, members, workspaces, and sessions.'}</p>
        </div>
        <div className="account-table-wrap activity-table-wrap">
          <table className="account-table activity-table">
            <thead>
              <tr>
                <th>{locale === 'ru' ? 'Событие' : 'Event'}</th>
                <th>{locale === 'ru' ? 'Автор' : 'Actor'}</th>
                <th>{locale === 'ru' ? 'Объект' : 'Entity'}</th>
                <th>{t('Time')}</th>
              </tr>
            </thead>
            <tbody>
              {activityItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.summary}</strong>
                    <span>{activityEventLabel(item.eventType, locale)}</span>
                  </td>
                  <td>{item.actorLogin || `${t('User')} ${item.userId}`}</td>
                  <td>{item.entityType ? `${activityEntityLabel(item.entityType, locale)}${item.entityId ? ` #${item.entityId}` : ''}` : t('Workspace')}</td>
                  <td>{formatCompactDate(item.createdAt)}</td>
                </tr>
              ))}
              {activityItems.length === 0 ? (
                <tr>
                  <td colSpan={4}>{t('No workspace activity yet.')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      <div className="settings-save-note">
        {t('Browser cache is still used for fast reloads, but backend settings are the source of truth after sign in.')}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field-block">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function activityEventLabel(value: string, locale: Locale = 'en') {
  if (locale === 'ru') {
    const labels: Record<string, string> = {
      account_generated: 'создан аккаунт',
      account_bulk_generated: 'создан пакет аккаунтов',
      account_shared: 'аккаунт открыт рабочей области',
      account_unshared: 'аккаунт снова личный',
      balance_status_updated: 'обновлен статус баланса',
      invite_created: 'создан инвайт',
      invite_revoked: 'инвайт отозван',
      member_added: 'участник добавлен',
      member_removed: 'участник удален',
      member_role_updated: 'роль участника обновлена',
      workspace_created: 'рабочая область создана',
      workspace_archived: 'рабочая область архивирована',
      workspace_restored: 'рабочая область восстановлена',
      password_changed: 'пароль изменен',
      session_revoked: 'сессия отозвана',
    };
    return labels[value] ?? value.replaceAll('_', ' ');
  }
  return value.replaceAll('_', ' ');
}

function activityEntityLabel(value: string, locale: Locale = 'en') {
  if (locale !== 'ru') return value;
  const labels: Record<string, string> = {
    account: 'аккаунт',
    invite: 'инвайт',
    member: 'участник',
    workspace: 'рабочая область',
    session: 'сессия',
    user: 'пользователь',
  };
  return labels[value] ?? value;
}

function UsagePill({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="usage-pill">
      <span>{label}</span>
      <strong>{used} / {limit}</strong>
    </div>
  );
}

function UsageStrip({ usage, locale = 'en' }: { usage: UsageSummary; locale?: Locale }) {
  return (
    <div className="usage-strip">
      <UsagePill label={tr(locale, 'Accounts today')} used={usage.limits.accountsPerDay.used} limit={usage.limits.accountsPerDay.limit} />
      <UsagePill label={tr(locale, 'Mailboxes today')} used={usage.limits.mailboxesPerDay.used} limit={usage.limits.mailboxesPerDay.limit} />
      <UsagePill label={tr(locale, 'Inbox / min')} used={usage.limits.inboxRefreshPerMinute.used} limit={usage.limits.inboxRefreshPerMinute.limit} />
    </div>
  );
}

function InfoTile({ label, value, action, onClick }: { label: string; value: string; action: string; onClick: () => void }) {
  return (
    <button type="button" className="info-tile" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small aria-hidden="true"><CopyIcon /></small>
      <span className="sr-only">{action}</span>
    </button>
  );
}

function EmailMessage({
  detail,
  activationLink,
  onActivate,
  onCopyEmail,
  copied,
  onWaitRefresh,
  isRefreshing,
  locale = 'en',
}: {
  detail: Detail;
  activationLink: string;
  onActivate: () => void;
  onCopyEmail: () => void;
  copied: boolean;
  onWaitRefresh?: () => void;
  isRefreshing?: boolean;
  locale?: Locale;
}) {
  const hasEmail = detail.inbox.status === 'email_received' && Boolean(detail.inbox.subject || detail.inbox.plainText || detail.inbox.rawHtml);
  const emailHtml = detail.inbox.rawHtml ? buildEmailSrcDoc(detail.inbox.rawHtml) : '';
  const activationHost = activationLink ? safeHostname(activationLink) : '';

  return (
    <section className="email-message-card">
      <div className="email-message-toolbar">
        <div>
          <h3>{tr(locale, 'Mailbox message')}</h3>
          <p>{hasEmail ? tr(locale, 'Original inbox message') : tr(locale, 'No message captured yet')}</p>
        </div>
        <div className="email-message-actions">
          {onWaitRefresh ? (
            <button className="micro-button email-wait-button" onClick={onWaitRefresh} disabled={Boolean(isRefreshing)}>
              {isRefreshing ? tr(locale, 'Waiting') : tr(locale, 'Wait & refresh')}
            </button>
          ) : null}
          <button className="micro-button email-open-button" onClick={onActivate} disabled={!activationLink}>{tr(locale, 'Open verification')}</button>
          {activationHost ? <span className="link-host-preview">{activationHost}</span> : null}
          <button className="micro-button icon-copy-button" onClick={onCopyEmail} disabled={!hasEmail} aria-label={tr(locale, 'Copy email text')} title={copied ? tr(locale, 'Copied') : tr(locale, 'Copy email text')}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      {hasEmail ? (
        <article className="email-message">
          <div className="email-message-meta">
            <div>
              <span>{tr(locale, 'From')}</span>
              <strong>{detail.inbox.sender || tr(locale, 'Unknown sender')}</strong>
            </div>
            <div>
              <span>{tr(locale, 'Subject')}</span>
              <strong>{detail.inbox.subject || tr(locale, 'No subject')}</strong>
            </div>
            <div>
              <span>{tr(locale, 'Received')}</span>
              <strong>{formatDate(detail.inbox.receivedAt)}</strong>
            </div>
          </div>

          {emailHtml ? (
            <iframe
              className="email-message-frame"
              title={`Email message for ${detail.email}`}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={emailHtml}
            />
          ) : (
            <pre className="email-message-text">{detail.inbox.plainText}</pre>
          )}
        </article>
      ) : (
        <div className="email-empty-state">
          <strong>{statusLabel(mapDetailStatus(detail), locale)}</strong>
          <span>{tr(locale, 'Refresh inbox after the registration email is sent.')}</span>
          {onWaitRefresh ? <button className="primary-button" onClick={onWaitRefresh} disabled={Boolean(isRefreshing)}>{isRefreshing ? tr(locale, 'Waiting for email') : tr(locale, 'Wait & refresh inbox')}</button> : null}
        </div>
      )}
    </section>
  );
}

function StandaloneInbox({ inbox, address, locale = 'en' }: { inbox: MailboxInbox | null; address: string; locale?: Locale }) {
  const hasEmail = inbox?.status === 'email_received' && Boolean(inbox.subject || inbox.plainText || inbox.rawHtml);
  const emailHtml = inbox?.rawHtml ? buildEmailSrcDoc(inbox.rawHtml) : '';

  if (!inbox) {
    return (
      <div className="email-empty-state">
        <strong>{tr(locale, 'Inbox ready')}</strong>
        <span>{tr(locale, 'Refresh after sending mail to')} {address}.</span>
      </div>
    );
  }

  if (!hasEmail) {
    return (
      <div className="email-empty-state">
        <strong>{statusLabel(inbox.status === 'email_received' ? 'email_received' : 'waiting', locale)}</strong>
        <span>{tr(locale, 'No messages in this temporary inbox yet.')}</span>
      </div>
    );
  }

  return (
    <article className="email-message">
      <div className="email-message-meta">
        <div>
          <span>{tr(locale, 'From')}</span>
          <strong>{inbox.sender || tr(locale, 'Unknown sender')}</strong>
        </div>
        <div>
          <span>{tr(locale, 'Subject')}</span>
          <strong>{inbox.subject || tr(locale, 'No subject')}</strong>
        </div>
        <div>
          <span>{tr(locale, 'Received')}</span>
          <strong>{formatDate(inbox.receivedAt)}</strong>
        </div>
      </div>

      {emailHtml ? (
        <iframe
          className="email-message-frame"
          title={`Email message for ${address}`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={emailHtml}
        />
      ) : (
        <pre className="email-message-text">{inbox.plainText}</pre>
      )}
    </article>
  );
}

function buildEmailSrcDoc(rawHtml: string) {
  const safeHtml = sanitizeEmailHtml(rawHtml);
  return `<!doctype html>
<html>
<head>
  <base target="_blank">
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
    body { padding: 16px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    a { color: #0f766e; }
  </style>
</head>
<body>${safeHtml}</body>
</html>`;
}

function sanitizeEmailHtml(rawHtml: string) {
  return rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s(?:src|srcset)=["'](?!data:)[^"']*["']/gi, '')
    .replace(/\shref=["'](?!https:\/\/)[^"']*["']/gi, '');
}

function openSafeExternalLink(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return;
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    // Ignore malformed links extracted from third-party email content.
  }
}

function safeHostname(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' ? url.hostname : '';
  } catch {
    return '';
  }
}

function InspectorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="inspector-group">
      <div className="inspector-group-title">{title}</div>
      <div className="inspector-rows">{children}</div>
    </section>
  );
}

function AccountsEmptyState({
  hasHistory,
  hasFilters,
  onClearFilters,
  locale = 'en',
}: {
  hasHistory: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
  locale?: Locale;
}) {
  if (hasHistory && hasFilters) {
    return (
      <div className="empty-state table-empty-state">
        <h3>{tr(locale, 'No matching test users')}</h3>
        <p>{tr(locale, 'Search or filters hide every account in this workspace.')}</p>
        <button type="button" className="micro-button" onClick={onClearFilters}>{tr(locale, 'Clear filters')}</button>
      </div>
    );
  }

  return (
    <div className="empty-state table-empty-state">
      <h3>{tr(locale, 'No test users yet')}</h3>
      <p>{tr(locale, 'Generate account from Main. They will appear here as table rows.')}</p>
      <Link className="micro-button" href="/main">{tr(locale, 'Open generator')}</Link>
    </div>
  );
}

function BalanceStatusField({
  value,
  onChange,
  disabled = false,
  locale = 'en',
}: {
  value: AccountBalanceStatus;
  onChange: (value: AccountBalanceStatus) => void;
  disabled?: boolean;
  locale?: Locale;
}) {
  return (
    <label className="account-id-field">
      <span>{tr(locale, 'Balance status')}</span>
      <BalanceStatusSelect value={value} disabled={disabled} onChange={onChange} locale={locale} />
    </label>
  );
}

function BalanceStatusSelect({
  value,
  onChange,
  disabled = false,
  locale = 'en',
}: {
  value: AccountBalanceStatus;
  onChange: (value: AccountBalanceStatus) => void;
  disabled?: boolean;
  locale?: Locale;
}) {
  return (
    <select
      className={cn('input-field compact badge-select balance-status-select', `tone-${balanceStatusTone(value)}`)}
      name="balanceStatus"
      value={value}
      aria-label={tr(locale, 'Balance status')}
      aria-busy={disabled}
      disabled={disabled}
      title={`${tr(locale, 'Balance status')}: ${balanceStatusLabel(value, locale)}`}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as AccountBalanceStatus)}
    >
      {BALANCE_STATUS_OPTIONS.map((item) => (
        <option key={item.value} value={item.value}>{balanceStatusLabel(item.value, locale)}</option>
      ))}
    </select>
  );
}

function PhoneEditField({
  value,
  canEdit,
  isSaving,
  isRegenerating,
  onChange,
  onSave,
  onRegenerate,
  onCopy,
  copied,
  locale = 'en',
}: {
  value: string;
  canEdit: boolean;
  isSaving: boolean;
  isRegenerating: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  copied: boolean;
  locale?: Locale;
}) {
  return (
    <label className="account-id-field">
      <span>{tr(locale, 'Phone')}</span>
      <div>
        <input
          className="input-field compact"
          id="phone"
          name="phone"
          value={value}
          onBlur={canEdit ? onSave : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          placeholder={locale === 'ru' ? 'Вставьте номер телефона' : 'Paste phone number'}
          readOnly={!canEdit}
        />
        <div className="inline-actions">
          {canEdit ? (
            <>
              <button type="button" className="micro-button" onClick={onSave} disabled={!isSaving}>{tr(locale, 'Save')}</button>
              <button type="button" className="micro-button icon-copy-button" onClick={onRegenerate} disabled={isRegenerating} aria-label={locale === 'ru' ? 'Перегенерировать телефон' : 'Regenerate phone'} title={locale === 'ru' ? 'Перегенерировать телефон' : 'Regenerate phone'}>
                <RefreshIcon />
              </button>
            </>
          ) : null}
          <button type="button" className="micro-button icon-copy-button" onClick={onCopy} aria-label={`${tr(locale, 'Copy')} ${tr(locale, 'Phone')}`} title={copied ? tr(locale, 'Copied') : tr(locale, 'Copy')}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>
    </label>
  );
}

function SharingField({
  item,
  canManage,
  isSaving = false,
  onToggle,
  locale = 'en',
}: {
  item: Detail;
  canManage: boolean;
  isSaving?: boolean;
  onToggle: (shared: boolean) => void;
  locale?: Locale;
}) {
  return (
    <label className="account-id-field">
      <span>{tr(locale, 'Workspace sharing')}</span>
      <SharingControl item={item} canManage={canManage} isSaving={isSaving} onToggle={onToggle} locale={locale} />
    </label>
  );
}

function SharingControl({
  item,
  canManage,
  isSaving = false,
  onToggle,
  locale = 'en',
}: {
  item: Pick<HistoryItem, 'createdByLogin' | 'sharedWithWorkspace'> | Pick<Detail, 'createdByLogin' | 'sharedWithWorkspace'>;
  canManage: boolean;
  isSaving?: boolean;
  onToggle: (shared: boolean) => void;
  locale?: Locale;
}) {
  const shared = isWorkspaceShared(item);
  return (
    <div className="sharing-control">
      <span className={cn('badge', `tone-${scopeTone(item)}`)} title={shared ? tr(locale, 'Visible to workspace members') : tr(locale, 'Visible only to creator')}>
        {scopeLabel(item, locale)}
      </span>
      {canManage ? (
        <button type="button" className="micro-button" disabled={isSaving} onClick={(event) => {
          event.stopPropagation();
          onToggle(!shared);
        }}>
          {isSaving ? tr(locale, 'Saving') : shared ? tr(locale, 'Make private') : tr(locale, 'Share')}
        </button>
      ) : (
        <span className="sharing-owner">{item.createdByLogin ? (locale === 'ru' ? `от ${item.createdByLogin}` : `by ${item.createdByLogin}`) : tr(locale, 'read only')}</span>
      )}
    </div>
  );
}

function PersonalInfoFields({
  detail,
  copiedField,
  onCopy,
  locale = 'en',
}: {
  detail: Detail;
  copiedField: string;
  onCopy: (key: string, value: string) => void;
  locale?: Locale;
}) {
  const address = `${detail.addressLine}, ${detail.postalCode}`;
  const fields = [
    { key: 'last-name', label: tr(locale, 'Last name'), value: detail.lastName },
    { key: 'first-name', label: tr(locale, 'First name'), value: detail.firstName },
    { key: 'dob', label: tr(locale, 'Date of birth'), value: detail.dateOfBirth },
    { key: 'pob', label: tr(locale, 'Place of birth'), value: detail.placeOfBirth },
    { key: 'doc-type', label: tr(locale, 'Type of document'), value: detail.documentType },
    { key: 'doc', label: tr(locale, 'Document number'), value: detail.documentValue },
    { key: 'issue-date', label: tr(locale, 'Document issue date'), value: detail.documentIssueDate },
    { key: 'country', label: tr(locale, 'Country'), value: detail.country },
    { key: 'region', label: tr(locale, 'Region'), value: detail.region },
    { key: 'city', label: tr(locale, 'City'), value: detail.city },
    { key: 'gender', label: tr(locale, 'Sex'), value: detail.gender },
    { key: 'address', label: tr(locale, 'Address'), value: address },
  ];

  return (
    <div className="personal-info-grid">
      {fields.map((field) => (
        <RegistrationInfoField
          key={field.key}
          label={field.label}
          value={field.value}
          onCopy={() => onCopy(`${field.key}:${detail.id}`, field.value)}
          copied={copiedField === `${field.key}:${detail.id}`}
          locale={locale}
        />
      ))}
    </div>
  );
}

function RegistrationInfoField({
  label,
  value,
  onCopy,
  copied,
  locale = 'en',
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  locale?: Locale;
}) {
  return (
    <div className="inspector-row registration-info-field">
      <div className="inspector-label">{label}</div>
      <div className="inspector-value">{value || '—'}</div>
      <div className="inspector-actions">
        <button className="micro-button icon-copy-button" onClick={onCopy} aria-label={`${tr(locale, 'Copy')} ${label}`} title={copied ? tr(locale, 'Copied') : tr(locale, 'Copy')}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function InspectorRow({
  label,
  value,
  onCopy,
  copied,
  hidden,
  onToggleHidden,
  sensitive,
  action,
  locale = 'en',
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
  sensitive?: boolean;
  action?: React.ReactNode;
  locale?: Locale;
}) {
  const display = sensitive ? (hidden ? '••••••••••••' : value) : value;

  return (
    <div className="inspector-row">
      <div className="inspector-label">{label}</div>
      <div className="inspector-value">{display || '—'}</div>
      <div className="inspector-actions">
        {sensitive && onToggleHidden ? <button className="micro-button" onClick={onToggleHidden}>{hidden ? tr(locale, 'Reveal') : tr(locale, 'Hide')}</button> : null}
        {action}
        <button className="micro-button icon-copy-button" onClick={onCopy} aria-label={`${tr(locale, 'Copy')} ${label}`} title={copied ? tr(locale, 'Copied') : tr(locale, 'Copy')}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function MdiLightIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 8.75A2.75 2.75 0 0 1 10.75 6h6.5A2.75 2.75 0 0 1 20 8.75v8.5A2.75 2.75 0 0 1 17.25 20h-6.5A2.75 2.75 0 0 1 8 17.25v-8.5Z" />
      <path d="M4 13.25v-6.5A2.75 2.75 0 0 1 6.75 4h7.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.25 4.25L19 7" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.4 9A7 7 0 0 0 6.2 6.8L4 9" />
      <path d="M5.6 15a7 7 0 0 0 12.2 2.2L20 15" />
    </svg>
  );
}
