'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, type ActivityItem, type AlertItem, type AnalyticsSummary, type AuthSession, type GeoItem, type HistoryItem, type UsageSummary, type UserInfo, type UserSettings, type WorkspaceInvite, type WorkspaceMember, type WorkspaceSettings as ServerWorkspaceSettings, type WorkspaceSummary } from '@/lib/api';
import { BALANCE_STATUS_OPTIONS, balanceStatusLabel, balanceStatusTone, buildSettingsTabs, inviteStatusTone, isWorkspaceShared, mapDetailStatus, mapHistoryStatus, roleTone, scopeLabel, scopeTone, statusLabel, statusTone, type AccountBalanceStatus, type HistoryStatus, type SettingsTab } from '@/lib/ui-state';

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
  const [showFilters, setShowFilters] = useState(true);
  const [copiedField, setCopiedField] = useState('');
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const [isRegeneratingPhone, setIsRegeneratingPhone] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
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
  const [accountEmail, setAccountEmail] = useState('');
  const [accountUsername, setAccountUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountStatus, setAccountStatus] = useState('Account ready');
  const [mailProviderStatus, setMailProviderStatus] = useState('Provider not checked');

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;

    const storedToken = storage.getItem('tag-token') ?? '';
    const storedUser = storage.getItem('tag-user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        storage.removeItem('tag-token');
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

  const selectedStatus = mapDetailStatus(detail);
  const currentWorkspace = workspaces.find((item) => item.id === user?.workspaceId);
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

  useEffect(() => {
    setSiteAccountIdDraft(detail?.siteAccountId ?? '');
  }, [detail?.id, detail?.siteAccountId]);

  useEffect(() => {
    setPhoneDraft(detail?.phone ?? '');
  }, [detail?.id, detail?.phone]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
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
        clearAuthState();
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
      clearAuthState();
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

  async function refreshSession() {
    const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/refresh', undefined, {
      method: 'POST',
      body: JSON.stringify({ workspaceId: user?.workspaceId }),
    });
    persistAuthState(res.token, res.user);
    return res.token;
  }

  async function logout() {
    try {
      if (token) {
        await apiFetch('/auth/logout', token, { method: 'POST' });
      }
    } catch {
      // Local cleanup still wins if the server session was already gone.
    }
    clearAuthState();
  }

  function persistAuthState(nextToken: string, nextUser: UserInfo) {
    const storage = getBrowserStorage();
    storage?.setItem('tag-token', nextToken);
    storage?.setItem('tag-user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function clearAuthState() {
    const storage = getBrowserStorage();
    storage?.removeItem('tag-token');
    storage?.removeItem('tag-user');
    setToken('');
    setUser(null);
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
      setIsRefreshingInbox(false);
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
    }
  }

  async function saveSharing(id: number, sharedWithWorkspace: boolean) {
    setError('');
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
    }
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
      `Balance Status: ${balanceStatusLabel(detail.balanceStatus)}`,
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
    window.open(activationLink, '_blank', 'noopener,noreferrer');
  }

  const generationSettingsPanel = (
    <section className="panel panel-generation accounts-settings bulk-card">
      <h3>Generation panel</h3>
      <p>Defaults used by Generate identity and Generate bulk.</p>
      <div className="form-stack">
        <Field label="GEO">
          <select className="input-field compact" value={selectedGeo} onChange={(e) => selectGeo(e.target.value)}>
            {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Form persona">
          <select className="input-field compact" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
            {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Document type">
          <select className="input-field compact" value={effectiveDocumentType} onChange={(e) => setDocumentType(e.target.value)}>
            {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="missing_rule_probe">missing_rule_probe</option>
          </select>
        </Field>
        <Field label="Mailbox provider">
          <select className="input-field compact" value={mailboxProvider} onChange={(e) => selectMailboxProvider(e.target.value as MailboxProviderKey)}>
            {MAILBOX_PROVIDER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Bulk count">
          <input
            className="input-field compact"
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
      <main className="auth-loading-shell" aria-label="Loading workspace">
        <div className="auth-loading-panel">
          <div className="sidebar-brand-mark">QA</div>
          <strong>Test User Console</strong>
          <span>Loading workspace</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={doLogin}>
          <div className="login-badge">Internal QA console</div>
          <h1>Test User Console</h1>
          <p>Generate test identities, copy registration data, and inspect mailbox verification.</p>
          <div className="login-fields">
            <input className="input-field" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" />
            <input className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
          </div>
          {error ? <p className="alert alert-error">{error}</p> : null}
          <button className="primary-button w-full">Sign in</button>
          <Link className="login-helper-link" href="/register">Have an invite token?</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="console-shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">QA</div>
            <div>
              <strong>Test User Console</strong>
              <span>Identity generation workspace</span>
            </div>
          </div>

          <div className="flow-block">
            <div className="flow-label">Workspace</div>
            <select
              className="workspace-switcher"
              value={user.workspaceId ?? ''}
              onChange={(event) => void switchWorkspace(Number(event.target.value))}
              disabled={isWorkspaceLoading}
              aria-label="Switch workspace"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id} disabled={workspace.status === 'archived'}>
                  {workspace.name}{workspace.status === 'archived' ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            <div className="flow-subtitle">{currentWorkspace?.memberCount ?? workspaceMembers.length} users · {user.workspaceRole ?? 'member'}</div>
            <span className={cn('flow-status', currentWorkspace?.status === 'archived' && 'is-archived')}>{currentWorkspace?.status ?? 'active'}</span>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn('sidebar-nav-item', activeNav === item.key && 'is-active')}
              >
                <span className="sidebar-nav-short">{item.short}</span>
                <span>{item.label}</span>
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
          <div className="sidebar-user">
            <strong>{user.login}</strong>
            <span>{user.role}</span>
          </div>
          <button className="sidebar-logout" onClick={() => void logout()}>Logout</button>
        </div>
      </aside>

      <section className="workspace-shell">
        <div className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>Test Users</span>
            <strong>Generation Console</strong>
          </div>
          <div className="topbar-admin">
            {usageSummary ? <UsagePill label="Accounts" used={usageSummary.limits.accountsPerDay.used} limit={usageSummary.limits.accountsPerDay.limit} /> : <SkeletonBox className="usage-pill-skeleton" />}
            <button className="icon-button" title="Command menu">CMD K</button>
            <div className="env-select"><span /> {currentWorkspace?.name ?? 'Workspace'}</div>
            <div className="env-select">{user.login}</div>
            <button className="logout-button" onClick={() => void logout()}>Logout</button>
          </div>
        </div>

        {error ? <div className="alert alert-error slim">{error}</div> : null}
        {isGenerating ? <div className="alert alert-info slim">Creating mailbox, credentials, and first inbox snapshot.</div> : null}
        {isBulkGenerating ? <div className="alert alert-info slim">Creating {bulkCount} identities and mailbox snapshots.</div> : null}
        <AlertsPanel items={alertItems} />

        {showQuickActions ? (
          <section className="quick-actions-panel">
          <div className="quick-actions-title">Quick actions</div>
          {usageSummary ? <UsageStrip usage={usageSummary} /> : <UsageStripSkeleton />}
          <div className="quick-actions-grid" aria-label="Primary identity actions">
            <button className="action-card" onClick={generate} disabled={isGenerateDisabled} title="G">
              <span className="action-icon">+</span>
              <span><strong>{isGenerating ? 'Generating identity' : 'Generate identity'}</strong><small>Single test user</small></span>
              <kbd>G</kbd>
            </button>
            <button className="action-card" onClick={generateBulk} disabled={isGenerateDisabled} title="B">
              <span className="action-icon">B</span>
              <span><strong>{isBulkGenerating ? `Generating ${bulkCount}` : 'Generate bulk'}</strong><small>Multiple test users</small></span>
              <kbd>B</kbd>
            </button>
            <button className="action-card" onClick={() => refreshInboxForDetail(30000)} disabled={primaryActionsDisabled || isRefreshingInbox} title="R">
              <span className="action-icon">R</span>
              <span><strong>{isRefreshingInbox ? 'Waiting for inbox' : 'Wait & refresh'}</strong><small>Selected test user</small></span>
              <kbd>R</kbd>
            </button>
            <button className="action-card" onClick={copyIdentityPack} disabled={primaryActionsDisabled}>
              <span className="action-icon">CP</span>
              <span><strong>Copy pack</strong><small>Registration data</small></span>
            </button>
          </div>
        </section>
        ) : null}

        <div className={cn('workspace-grid', activeNav === 'main' ? undefined : activeNav === 'accounts' ? 'accounts-view' : 'single-view')}>
          {activeNav === 'main' ? (
          <>
          {generationSettingsPanel}

          <section className="panel panel-list">
            <div className="panel-header">
              <h2>Recent identities <span>({history.length})</span></h2>
              <button type="button" className="filter-button" onClick={() => setShowFilters((value) => !value)}>F</button>
            </div>

            {showFilters ? (
              <div className="list-controls">
                <input className="input-field compact" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search test users..." />
                <div className="control-row">
                  <select className="input-field compact" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | HistoryStatus)}>
                    <option value="all">All statuses</option>
                    <option value="generated">Generated</option>
                    <option value="email_received">Email received</option>
                    <option value="waiting">Waiting</option>
                  </select>
                  <select className="input-field compact" value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value as 'all' | AccountBalanceStatus)}>
                    <option value="all">All balances</option>
                    {BALANCE_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <select className="input-field compact" value={sortMode} onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className="account-list">
              {isWorkspaceBootstrapping ? <ListSkeleton rows={6} /> : filteredHistory.length ? filteredHistory.map((item) => {
                const rowStatus = mapHistoryStatus(item);
                const selected = detail?.id === item.id;
                return (
                  <button key={item.id} type="button" className={cn('account-row', selected && 'is-selected')} onClick={() => loadDetail(item.id)}>
                    <span className={cn('badge status-marker', `tone-${statusTone(rowStatus)}`)} title={statusLabel(rowStatus)} aria-label={statusLabel(rowStatus)}>
                      <span className={cn('badge-dot', `tone-${statusTone(rowStatus)}`)} />
                    </span>
                    <strong>{item.siteAccountId || item.username}</strong>
                    <span className={cn('badge', `tone-${scopeTone(item)}`)}>{scopeLabel(item)}</span>
                    <time>{formatCompactDate(item.createdAt)}</time>
                  </button>
                );
              }) : <div className="empty-state">No test users match the current filters.</div>}
            </div>
            <Link className="view-all-button" href="/accounts">View all test users</Link>
          </section>

          <section className="panel panel-detail">
            <div className="panel-header">
              <h2>Identity workspace {detail ? <span className={cn('badge', `tone-${statusTone(selectedStatus)}`)}>{statusLabel(selectedStatus)}</span> : null}</h2>
            </div>

            {isWorkspaceBootstrapping && !detail ? (
              <IdentityWorkspaceSkeleton />
            ) : !detail ? (
              <div className="empty-workspace">
                <h3>Generate an identity or open one from the list</h3>
                <p>The selected test user appears here with registration data, mailbox, and verification.</p>
              </div>
            ) : (
              <div className="detail-stack">
                <section className="registration-form-grid">
                  <div className="form-section">
                    <h3>Test user</h3>
                    <label className="account-id-field">
                      <span>Account ID</span>
                      <div>
                        <input
                          className="input-field compact"
                          value={siteAccountIdDraft}
                          onBlur={saveSiteAccountId}
                          onChange={(e) => setSiteAccountIdDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="Paste site account ID"
                        />
                        <button className="micro-button" onClick={saveSiteAccountId} disabled={siteAccountIdDraft.trim() === (detail.siteAccountId ?? '')}>Save</button>
                      </div>
                    </label>
                    <BalanceStatusField value={detail.balanceStatus} onChange={(value) => void saveBalanceStatus(detail.id, value)} />
                    <SharingField
                      item={detail}
                      canManage={detail.createdByUserId === user.id}
                      onToggle={(shared) => void saveSharing(detail.id, shared)}
                    />
                    <InspectorRow label="Password" value={detail.emailPassword} hidden={!showPassword} onToggleHidden={() => setShowPassword((v) => !v)} onCopy={() => copyValue(`mailbox-password:${detail.id}`, detail.emailPassword)} copied={copiedField === `mailbox-password:${detail.id}`} sensitive />
                    <InspectorRow label="Username" value={detail.username} onCopy={() => copyValue(`username:${detail.id}`, detail.username)} copied={copiedField === `username:${detail.id}`} />
                    <InspectorRow label="Registration date" value={formatDate(detail.createdAt)} onCopy={() => copyValue(`created:${detail.id}`, formatDate(detail.createdAt))} copied={copiedField === `created:${detail.id}`} />
                    <InspectorRow label="Mailbox provider" value={mailboxProviderLabel(detail.mailboxProvider)} onCopy={() => copyValue(`mailbox-provider:${detail.id}`, mailboxProviderLabel(detail.mailboxProvider))} copied={copiedField === `mailbox-provider:${detail.id}`} />
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
                    />
                    <InspectorRow label="Email" value={detail.email} onCopy={() => copyValue(`email:${detail.id}`, detail.email)} copied={copiedField === `email:${detail.id}`} />
                  </div>

                  <div className="form-section form-section-wide">
                    <h3>Personal info</h3>
                    <div className="personal-info-grid">
                      <InspectorRow label="Last name" value={detail.lastName} onCopy={() => copyValue(`last-name:${detail.id}`, detail.lastName)} copied={copiedField === `last-name:${detail.id}`} />
                      <InspectorRow label="Document issue date" value={detail.documentIssueDate} onCopy={() => copyValue(`issue-date:${detail.id}`, detail.documentIssueDate)} copied={copiedField === `issue-date:${detail.id}`} />
                      <InspectorRow label="First name" value={detail.firstName} onCopy={() => copyValue(`first-name:${detail.id}`, detail.firstName)} copied={copiedField === `first-name:${detail.id}`} />
                      <InspectorRow label="Country" value={detail.country} onCopy={() => copyValue(`country:${detail.id}`, detail.country)} copied={copiedField === `country:${detail.id}`} />
                      <InspectorRow label="Date of birth" value={detail.dateOfBirth} onCopy={() => copyValue(`dob:${detail.id}`, detail.dateOfBirth)} copied={copiedField === `dob:${detail.id}`} />
                      <InspectorRow label="Region" value={detail.region} onCopy={() => copyValue(`region:${detail.id}`, detail.region)} copied={copiedField === `region:${detail.id}`} />
                      <InspectorRow label="Place of birth" value={detail.placeOfBirth} onCopy={() => copyValue(`pob:${detail.id}`, detail.placeOfBirth)} copied={copiedField === `pob:${detail.id}`} />
                      <InspectorRow label="City" value={detail.city} onCopy={() => copyValue(`city:${detail.id}`, detail.city)} copied={copiedField === `city:${detail.id}`} />
                      <InspectorRow label="Type of document" value={detail.documentType} onCopy={() => copyValue(`doc-type:${detail.id}`, detail.documentType)} copied={copiedField === `doc-type:${detail.id}`} />
                      <InspectorRow label="Sex" value={detail.gender} onCopy={() => copyValue(`gender:${detail.id}`, detail.gender)} copied={copiedField === `gender:${detail.id}`} />
                      <InspectorRow label="Document number" value={detail.documentValue} onCopy={() => copyValue(`doc:${detail.id}`, detail.documentValue)} copied={copiedField === `doc:${detail.id}`} />
                      <InspectorRow label="Address" value={`${detail.addressLine}, ${detail.postalCode}`} onCopy={() => copyValue(`address:${detail.id}`, `${detail.addressLine}, ${detail.postalCode}`)} copied={copiedField === `address:${detail.id}`} />
                    </div>
                  </div>
                </section>

                <section className="identity-pack">
                  <div className="identity-pack-header">
                    <h3>Registration form data</h3>
                    <button className="micro-button" onClick={copyIdentityPack}>Copy all</button>
                  </div>
                  <DatasetNotice quality={detail.documentQuality} />
                  <div className="identity-pack-grid">
                    <InfoTile label="Name fields" value={`${detail.lastName}\n${detail.firstName}`} action="Copy" onClick={() => copyValue(`names:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
                    <InfoTile label="Region fields" value={`${detail.country}\n${detail.region}\n${detail.city}`} action="Copy" onClick={() => copyValue(`region-pack:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
                    <InfoTile label="Document" value={`${detail.documentType}\n${detail.documentValue}`} action="Copy" onClick={() => copyValue(`doc-tile:${detail.id}`, `${detail.documentType}\n${detail.documentValue}`)} />
                    <InfoTile label="Phone" value={detail.phone} action="Copy" onClick={() => copyValue(`phone:${detail.id}`, localPhoneDigits(detail.phone, detail.geoKey))} />
                    <InfoTile label="Email" value={detail.email} action="Copy" onClick={() => copyValue(`email:${detail.id}`, detail.email)} />
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
                />
              </div>
            )}
          </section>

          {hasVerificationCodes ? (
            <section className="panel panel-codes">
              <div className="panel-header">
                <h2>Codes <span>({verificationCodes.length})</span></h2>
              </div>
              <div className="codes-list">
                {verificationCodes.map((code, index) => (
                <button key={`${code}:${index}`} type="button" className="code-row" onClick={() => copyValue(`code:${code}`, code)}>
                  <span>{index === 0 ? 'Email code' : 'SMS code'}</span>
                  <strong>{code}</strong>
                  <small>{copiedField === `code:${code}` ? 'Copied' : 'CP'}</small>
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
            <div className="panel-header">
              <h2>Test Users <span>({history.length})</span></h2>
              <button type="button" className="filter-button" onClick={() => setShowFilters((value) => !value)}>F</button>
            </div>

            {showFilters ? (
              <div className="list-controls">
                <input className="input-field compact" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search test users..." />
                <div className="control-row">
                  <select className="input-field compact" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | HistoryStatus)}>
                    <option value="all">All statuses</option>
                    <option value="generated">Generated</option>
                    <option value="email_received">Email received</option>
                    <option value="waiting">Waiting</option>
                  </select>
                  <select className="input-field compact" value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value as 'all' | AccountBalanceStatus)}>
                    <option value="all">All balances</option>
                    {BALANCE_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <select className="input-field compact" value={accountGeoFilter} onChange={(e) => setAccountGeoFilter(e.target.value)}>
                    <option value="all">All GEOs</option>
                    {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  <select className="input-field compact" value={sortMode} onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className="account-table-wrap">
              {isWorkspaceBootstrapping ? <TableSkeleton columns={8} rows={7} /> : filteredHistory.length ? (
                <table className="account-table">
                  <thead>
                    <tr>
                      <th>Test user</th>
                      <th>GEO</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Balance</th>
                      <th>Scope</th>
                      <th>Created</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item) => {
                      const rowStatus = mapHistoryStatus(item);
                      const selected = detail?.id === item.id;
                      return (
                        <tr key={item.id} className={cn(selected && 'is-selected')}>
                          <td>
                            <strong>{item.siteAccountId || item.username}</strong>
                            <span>{item.firstName} {item.lastName}</span>
                          </td>
                          <td>{item.geoLabel}</td>
                          <td>{item.email}</td>
                          <td><span className={cn('badge', `tone-${statusTone(rowStatus)}`)}>{statusLabel(rowStatus)}</span></td>
                          <td>
                            <BalanceStatusSelect
                              value={item.balanceStatus}
                              onChange={(value) => void saveBalanceStatus(item.id, value)}
                            />
                          </td>
                          <td>
                            <SharingControl
                              item={item}
                              canManage={item.createdByUserId === user.id}
                              onToggle={(shared) => void saveSharing(item.id, shared)}
                            />
                          </td>
                          <td>{formatCompactDate(item.createdAt)}</td>
                          <td><button type="button" className="micro-button" onClick={() => loadDetail(item.id)}>Details</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <div className="empty-state">No test users match the current filters.</div>}
            </div>
            <Link className="view-all-button" href="/accounts">View all test users</Link>
          </section>

          {detail && typeof document !== 'undefined' ? createPortal((
            <div className="account-detail-overlay" role="dialog" aria-modal="true" aria-label="Test user details" onClick={() => setDetail(null)}>
              <section className="panel panel-detail account-detail-modal" onClick={(event) => event.stopPropagation()}>
                <div className="panel-header">
                  <h2>Test user details <span className={cn('badge', `tone-${statusTone(selectedStatus)}`)}>{statusLabel(selectedStatus)}</span></h2>
                  <button type="button" className="micro-button" onClick={() => setDetail(null)}>Close</button>
                </div>

              <div className="detail-stack">
                <section className="registration-form-grid">
                  <div className="form-section">
                    <h3>Test user</h3>
                    <label className="account-id-field">
                      <span>Account ID</span>
                      <div>
                        <input
                          className="input-field compact"
                          value={siteAccountIdDraft}
                          onBlur={saveSiteAccountId}
                          onChange={(e) => setSiteAccountIdDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          placeholder="Paste site account ID"
                        />
                        <button className="micro-button" onClick={saveSiteAccountId} disabled={siteAccountIdDraft.trim() === (detail.siteAccountId ?? '')}>Save</button>
                      </div>
                    </label>
                    <BalanceStatusField value={detail.balanceStatus} onChange={(value) => void saveBalanceStatus(detail.id, value)} />
                    <SharingField
                      item={detail}
                      canManage={detail.createdByUserId === user.id}
                      onToggle={(shared) => void saveSharing(detail.id, shared)}
                    />
                    <InspectorRow label="Password" value={detail.emailPassword} hidden={!showPassword} onToggleHidden={() => setShowPassword((v) => !v)} onCopy={() => copyValue(`mailbox-password:${detail.id}`, detail.emailPassword)} copied={copiedField === `mailbox-password:${detail.id}`} sensitive />
                    <InspectorRow label="Username" value={detail.username} onCopy={() => copyValue(`username:${detail.id}`, detail.username)} copied={copiedField === `username:${detail.id}`} />
                    <InspectorRow label="Registration date" value={formatDate(detail.createdAt)} onCopy={() => copyValue(`created:${detail.id}`, formatDate(detail.createdAt))} copied={copiedField === `created:${detail.id}`} />
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
                    />
                    <InspectorRow label="Email" value={detail.email} onCopy={() => copyValue(`email:${detail.id}`, detail.email)} copied={copiedField === `email:${detail.id}`} />
                  </div>

                  <div className="form-section form-section-wide">
                    <h3>Personal info</h3>
                    <div className="personal-info-grid">
                      <InspectorRow label="Last name" value={detail.lastName} onCopy={() => copyValue(`last-name:${detail.id}`, detail.lastName)} copied={copiedField === `last-name:${detail.id}`} />
                      <InspectorRow label="Document issue date" value={detail.documentIssueDate} onCopy={() => copyValue(`issue-date:${detail.id}`, detail.documentIssueDate)} copied={copiedField === `issue-date:${detail.id}`} />
                      <InspectorRow label="First name" value={detail.firstName} onCopy={() => copyValue(`first-name:${detail.id}`, detail.firstName)} copied={copiedField === `first-name:${detail.id}`} />
                      <InspectorRow label="Country" value={detail.country} onCopy={() => copyValue(`country:${detail.id}`, detail.country)} copied={copiedField === `country:${detail.id}`} />
                      <InspectorRow label="Date of birth" value={detail.dateOfBirth} onCopy={() => copyValue(`dob:${detail.id}`, detail.dateOfBirth)} copied={copiedField === `dob:${detail.id}`} />
                      <InspectorRow label="Region" value={detail.region} onCopy={() => copyValue(`region:${detail.id}`, detail.region)} copied={copiedField === `region:${detail.id}`} />
                      <InspectorRow label="Place of birth" value={detail.placeOfBirth} onCopy={() => copyValue(`pob:${detail.id}`, detail.placeOfBirth)} copied={copiedField === `pob:${detail.id}`} />
                      <InspectorRow label="City" value={detail.city} onCopy={() => copyValue(`city:${detail.id}`, detail.city)} copied={copiedField === `city:${detail.id}`} />
                      <InspectorRow label="Type of document" value={detail.documentType} onCopy={() => copyValue(`doc-type:${detail.id}`, detail.documentType)} copied={copiedField === `doc-type:${detail.id}`} />
                      <InspectorRow label="Sex" value={detail.gender} onCopy={() => copyValue(`gender:${detail.id}`, detail.gender)} copied={copiedField === `gender:${detail.id}`} />
                      <InspectorRow label="Document number" value={detail.documentValue} onCopy={() => copyValue(`doc:${detail.id}`, detail.documentValue)} copied={copiedField === `doc:${detail.id}`} />
                      <InspectorRow label="Address" value={`${detail.addressLine}, ${detail.postalCode}`} onCopy={() => copyValue(`address:${detail.id}`, `${detail.addressLine}, ${detail.postalCode}`)} copied={copiedField === `address:${detail.id}`} />
                    </div>
                  </div>
                </section>

                <section className="identity-pack">
                  <div className="identity-pack-header">
                    <h3>Registration form data</h3>
                    <button className="micro-button" onClick={copyIdentityPack}>Copy all</button>
                  </div>
                  <DatasetNotice quality={detail.documentQuality} />
                  <div className="identity-pack-grid">
                    <InfoTile label="Name fields" value={`${detail.lastName}\n${detail.firstName}`} action="Copy" onClick={() => copyValue(`names:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
                    <InfoTile label="Region fields" value={`${detail.country}\n${detail.region}\n${detail.city}`} action="Copy" onClick={() => copyValue(`region-pack:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
                    <InfoTile label="Document" value={`${detail.documentType}\n${detail.documentValue}`} action="Copy" onClick={() => copyValue(`doc-tile:${detail.id}`, `${detail.documentType}\n${detail.documentValue}`)} />
                    <InfoTile label="Phone" value={detail.phone} action="Copy" onClick={() => copyValue(`phone:${detail.id}`, localPhoneDigits(detail.phone, detail.geoKey))} />
                    <InfoTile label="Email" value={detail.email} action="Copy" onClick={() => copyValue(`email:${detail.id}`, detail.email)} />
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
                />
              </div>
              </section>
            </div>
          ), document.body) : null}

          {hasVerificationCodes ? (
            <section className="panel panel-codes">
              <div className="panel-header">
                <h2>Codes <span>({verificationCodes.length})</span></h2>
              </div>
              <div className="codes-list">
                {verificationCodes.map((code, index) => (
                <button key={`${code}:${index}`} type="button" className="code-row" onClick={() => copyValue(`code:${code}`, code)}>
                  <span>{index === 0 ? 'Email code' : 'SMS code'}</span>
                  <strong>{code}</strong>
                  <small>{copiedField === `code:${code}` ? 'Copied' : 'CP'}</small>
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

function AlertsPanel({ items }: { items: AlertItem[] }) {
  if (!items.length) return null;

  return (
    <section className="alerts-panel" aria-label="Workspace alerts">
      {items.slice(0, 3).map((item) => (
        <div key={item.id} className={cn('alert-card', `tone-${item.tone}`)}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.message}</span>
          </div>
          {item.metric ? <small>{item.metric}</small> : null}
        </div>
      ))}
    </section>
  );
}

function DatasetNotice({ quality }: { quality: Detail['documentQuality'] }) {
  const title = quality === 'verified'
    ? 'Verified format, synthetic data'
    : quality === 'missing_rules'
      ? 'Dataset rule missing'
      : 'Dataset under review';

  return (
    <div className={cn('dataset-notice', quality !== 'verified' && 'is-review')}>
      <strong>{title}</strong>
      <span>Identity data is still being reviewed and may not be 100% accurate. Use it as test data only.</span>
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
}) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('defaults');

  if (activeNav === 'mailboxes') {
    return (
      <section className="panel utility-panel">
        <div className="utility-header">
          <div>
            <h2>Mailboxes</h2>
            <p>Open a mailbox, inspect the latest message, and copy parsed verification links or codes.</p>
          </div>
          <button type="button" className="primary-button" onClick={onCreateMailbox} disabled={isCreatingMailbox}>
            {isCreatingMailbox ? 'Creating mailbox' : 'Create temporary mailbox'}
          </button>
        </div>

        <div className="mailboxes-layout">
          <section className="mailbox-reader">
            <div className="mailbox-reader-header">
              <div>
                <h3>{detail ? detail.email : tempMailbox ? tempMailbox.address : 'Inbox'}</h3>
                <p>{detail ? `Test user: ${detail.siteAccountId || detail.username}` : tempMailbox ? 'Standalone temporary mailbox' : 'Open a generated mailbox or create a temporary one.'}</p>
              </div>
              <div className="mailbox-reader-actions">
                {detail ? (
                  <>
                    <button type="button" className="micro-button" onClick={() => onRefreshInbox(0)} disabled={isRefreshingInbox}>
                      Check now
                    </button>
                    <button type="button" className="primary-button" onClick={() => onRefreshInbox(30000)} disabled={isRefreshingInbox}>
                      {isRefreshingInbox ? 'Waiting' : 'Wait & refresh'}
                    </button>
                  </>
                ) : tempMailbox ? (
                  <>
                    <button type="button" className="micro-button" onClick={() => onRefreshTempMailbox(0)} disabled={isRefreshingTempMailbox}>
                      Check now
                    </button>
                    <button type="button" className="primary-button" onClick={() => onRefreshTempMailbox(30000)} disabled={isRefreshingTempMailbox}>
                      {isRefreshingTempMailbox ? 'Waiting' : 'Wait & refresh'}
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
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                }}
                onCopyEmail={() => onCopy(`mailboxes-message:${detail.id}`, detail.inbox.plainText || detail.inbox.subject || '')}
                copied={copiedField === `mailboxes-message:${detail.id}`}
                onWaitRefresh={() => onRefreshInbox(30000)}
                isRefreshing={isRefreshingInbox}
              />
            ) : tempMailbox ? (
              <>
                <div className="mailbox-credentials">
                  <button type="button" onClick={() => onCopy('temp-mailbox-address', tempMailbox.address)}>
                    <span>Email</span>
                    <strong>{tempMailbox.address}</strong>
                    <small>{copiedField === 'temp-mailbox-address' ? 'Copied' : 'Copy'}</small>
                  </button>
                  <button type="button" onClick={() => onCopy('temp-mailbox-password', tempMailbox.password)}>
                    <span>Password</span>
                    <strong>{tempMailbox.password}</strong>
                    <small>{copiedField === 'temp-mailbox-password' ? 'Copied' : 'Copy'}</small>
                  </button>
                </div>
                <StandaloneInbox inbox={tempMailboxInbox} address={tempMailbox.address} />
              </>
            ) : (
              <div className="email-empty-state">
                <strong>No mailbox opened</strong>
                <span>Select `Open` in the table below to view that mailbox inbox here.</span>
              </div>
            )}
          </section>

          <div className="account-table-wrap mailboxes-table-wrap">
            {isWorkspaceLoading ? <TableSkeleton columns={5} rows={6} /> : (
            <table className="account-table mailboxes-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Test user</th>
                  <th>Status</th>
                  <th>Created</th>
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
                      <td><span className={cn('badge', `tone-${statusTone(status)}`)}>{statusLabel(status)}</span></td>
                      <td>{formatCompactDate(item.createdAt)}</td>
                      <td><button type="button" className="micro-button" onClick={() => onLoadDetail(item.id)}>Open</button></td>
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
            <h2>Registration form data</h2>
            <p>Exact values to paste into the target registration form.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => detail ? onCopy(`form-data:${detail.id}`, detail.fullProfileText) : undefined} disabled={!detail}>
            {copiedField === `form-data:${detail?.id}` ? 'Copied' : 'Copy selected data'}
          </button>
        </div>

        <div className="settings-grid">
          <Field label="Default GEO">
            <select className="input-field compact" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
              {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Persona">
            <select className="input-field compact" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
              {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Document type">
            <select className="input-field compact" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              <option value="missing_rule_probe">missing_rule_probe</option>
            </select>
          </Field>
        </div>

        {detail ? (
          <div className="form-data-grid">
            <InfoTile label="Account ID" value={detail.siteAccountId || 'Not set'} action="Copy" onClick={() => onCopy(`fd-account:${detail.id}`, detail.siteAccountId || '')} />
            <InfoTile label="First / last name" value={`${detail.firstName}\n${detail.lastName}`} action="Copy" onClick={() => onCopy(`fd-name:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
            <InfoTile label="Birth / sex" value={`${detail.dateOfBirth}\n${detail.gender}`} action="Copy" onClick={() => onCopy(`fd-birth:${detail.id}`, `${detail.dateOfBirth}\n${detail.gender}`)} />
            <InfoTile label="Country / region / city" value={`${detail.country}\n${detail.region}\n${detail.city}`} action="Copy" onClick={() => onCopy(`fd-geo:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
            <InfoTile label="Document" value={`${detail.documentType}\n${detail.documentValue}\n${detail.documentIssueDate}`} action="Copy" onClick={() => onCopy(`fd-doc:${detail.id}`, `${detail.documentType}\n${detail.documentValue}\n${detail.documentIssueDate}`)} />
            <InfoTile label="Contacts" value={`${detail.email}\n${detail.phone}`} action="Copy" onClick={() => onCopy(`fd-contact:${detail.id}`, `${detail.email}\n${localPhoneDigits(detail.phone, detail.geoKey)}`)} />
          </div>
        ) : (
          <div className="form-data-picker">
            <div className="section-subhead">
              <h3>Select test user</h3>
              <p>Open any generated test user to display its exact registration fields on this page.</p>
            </div>
            <div className="account-table-wrap">
              {isWorkspaceLoading ? <TableSkeleton columns={4} rows={6} /> : (
              <table className="account-table">
                <thead>
                  <tr><th>Test user</th><th>GEO</th><th>Email</th><th /></tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.siteAccountId || item.username}</strong><span>{item.firstName} {item.lastName}</span></td>
                      <td>{item.geoLabel}</td>
                      <td>{item.email}</td>
                      <td><button type="button" className="micro-button" onClick={() => onLoadDetail(item.id)}>Open data</button></td>
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
            <h2>Verification</h2>
            <p>Codes and verification links for the selected test user.</p>
          </div>
          <span className={cn('badge', `tone-${statusTone(mapDetailStatus(detail))}`)}>{detail ? statusLabel(mapDetailStatus(detail)) : 'No test user selected'}</span>
        </div>

        {detail ? (
          <div className="verification-page-grid">
            <div>
              <h3>Codes</h3>
              {codes.length ? codes.map((code, index) => (
                <button key={`${code}:${index}`} type="button" className="code-row" onClick={() => onCopy(`codes-page:${code}`, code)}>
                  <span>{index === 0 ? 'Email code' : 'Code'}</span>
                  <strong>{code}</strong>
                  <small>{copiedField === `codes-page:${code}` ? 'Copied' : 'CP'}</small>
                  <time>{formatCompactDate(detail.inbox.receivedAt)}</time>
                </button>
              )) : <div className="empty-state compact">No codes captured yet.</div>}
            </div>
            <div>
              <h3>Links</h3>
              {links.length ? links.map((link) => (
                <button key={link.url} type="button" className="verification-link-card" onClick={() => onCopy(`codes-link:${link.url}`, link.url)}>
                  <strong>{link.label || (link.isPrimary ? 'Primary verification link' : 'Verification link')}</strong>
                  <span>{truncate(link.url, 92)}</span>
                </button>
              )) : <div className="empty-state compact">No links captured yet.</div>}
            </div>
          </div>
        ) : (
          <div className="account-table-wrap">
            {isWorkspaceLoading ? <TableSkeleton columns={4} rows={6} /> : (
            <table className="account-table">
              <thead>
                <tr><th>Test user</th><th>GEO</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.siteAccountId || item.username}</strong><span>{item.email}</span></td>
                    <td>{item.geoLabel}</td>
                    <td><span className={cn('badge', `tone-${statusTone(mapHistoryStatus(item))}`)}>{statusLabel(mapHistoryStatus(item))}</span></td>
                    <td><button type="button" className="micro-button" onClick={() => onLoadDetail(item.id)}>Open</button></td>
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
  });

  return (
    <section className="panel utility-panel">
      <div className="utility-header settings-header">
        <div>
          <h2>Settings</h2>
          <p>Defaults, workspace limits, access, and account security are grouped by task.</p>
        </div>
        <span className={cn('badge', settingsStatus === 'Save failed' ? 'tone-warning' : 'tone-success')}>{settingsStatus}</span>
      </div>

      {isWorkspaceLoading ? <SettingsTabsSkeleton /> : (
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
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
          <h3>Generation Defaults</h3>
          <p>Your preferred GEO, persona, document type, and bulk count for new test users.</p>
        </div>
        <div className="settings-grid">
          <Field label="Default GEO">
            <select className="input-field compact" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
              {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Default persona">
            <select className="input-field compact" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
              {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Default document">
            <select className="input-field compact" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              <option value="missing_rule_probe">missing_rule_probe</option>
            </select>
          </Field>
          <Field label="Bulk count">
            <input className="input-field compact" type="number" min="1" max={usageSummary?.settings.maxBulkCount ?? 25} value={bulkCount} onChange={(e) => setBulkCount(Math.min(usageSummary?.settings.maxBulkCount ?? 25, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
        </div>
        <div className="settings-actions">
          <span>{userSettings ? `Server default: ${userSettings.defaultGeo} / ${userSettings.defaultDocumentType}` : 'Server defaults loading'}</span>
          <button type="button" className="primary-button" onClick={onSavePersonalSettings} disabled={isSavingSettings}>
            {isSavingSettings ? 'Saving' : 'Save personal settings'}
          </button>
        </div>
      </section>
      ) : null}

      {settingsTab === 'workspace' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>Workspace Limits</h3>
          <p>Shared retention, provider limits, and bulk-generation controls for the workspace.</p>
        </div>
        <div className="workspace-create-row">
          <div>
            <strong>{currentWorkspace?.name ?? 'Current workspace'}</strong>
            <span>{workspaces.length} workspaces available · active role {currentWorkspace?.workspaceRole ?? 'member'}</span>
          </div>
          <input
            className="input-field compact"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="New workspace name"
          />
          <button type="button" className="primary-button" onClick={onCreateWorkspace} disabled={isSavingSettings || !newWorkspaceName.trim()}>
            Create workspace
          </button>
        </div>
        <div className="members-table-wrap workspace-lifecycle-wrap">
          <table className="account-table members-table workspace-lifecycle-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Status</th>
                <th>Role</th>
                <th>Users</th>
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
                      <span>{workspace.id === currentWorkspace?.id ? 'Current workspace' : `Updated ${formatCompactDate(workspace.updatedAt)}`}</span>
                    </td>
                    <td><span className={cn('badge', isActive ? 'tone-success' : 'tone-warning')}>{workspace.status}</span></td>
                    <td><span className={cn('badge', `tone-${roleTone(workspace.workspaceRole)}`)}>{workspace.workspaceRole}</span></td>
                    <td>{workspace.memberCount}</td>
                    <td>
                      <button
                        type="button"
                        className="micro-button"
                        onClick={() => onUpdateWorkspaceLifecycle(workspace.id, isActive ? 'archived' : 'active')}
                        disabled={isSavingSettings || !isOwner || disablesLastActive}
                      >
                        {isActive ? 'Archive' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="settings-grid">
          <Field label="History retention days">
            <input className="input-field compact" type="number" min="1" max="3650" value={editableWorkspaceSettings.historyRetentionDays} onChange={(e) => updateWorkspaceDraft({ historyRetentionDays: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="History limit">
            <input className="input-field compact" type="number" min="1" max="1000" value={editableWorkspaceSettings.historyLimit} onChange={(e) => updateWorkspaceDraft({ historyLimit: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Max bulk count">
            <input className="input-field compact" type="number" min="1" max="100" value={editableWorkspaceSettings.maxBulkCount} onChange={(e) => updateWorkspaceDraft({ maxBulkCount: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="Mailbox provider">
            <select className="input-field compact" value={editableWorkspaceSettings.mailboxProvider} onChange={(e) => updateWorkspaceDraft({ mailboxProvider: e.target.value as ServerWorkspaceSettings['mailboxProvider'] })}>
              <option value="mail_tm">mail.tm</option>
              <option value="mail_gw">mail.gw</option>
              <option value="mail_tm_mail_gw_fallback">mail.tm → mail.gw fallback</option>
            </select>
          </Field>
          <Field label="Shared account editing">
            <select className="input-field compact" value={editableWorkspaceSettings.sharedAccountEditing} onChange={(e) => updateWorkspaceDraft({ sharedAccountEditing: e.target.value as ServerWorkspaceSettings['sharedAccountEditing'] })}>
              <option value="creator_only">Creator only</option>
              <option value="owner_admin">Owner/admin can edit shared</option>
            </select>
          </Field>
          <Field label="Workspace creation">
            <select className="input-field compact" value={editableWorkspaceSettings.workspaceCreationPolicy} onChange={(e) => updateWorkspaceDraft({ workspaceCreationPolicy: e.target.value as ServerWorkspaceSettings['workspaceCreationPolicy'] })}>
              <option value="active_users">Any active user</option>
              <option value="owner_admin">Current owner/admin only</option>
            </select>
          </Field>
          <label className="settings-toggle">
            <input type="checkbox" checked={editableWorkspaceSettings.allowBulkGeneration} onChange={(e) => updateWorkspaceDraft({ allowBulkGeneration: e.target.checked })} />
            <span>Allow bulk generation</span>
          </label>
        </div>
        <div className="settings-grid quota-grid">
          <Field label="Accounts per day">
            <input className="input-field compact" type="number" min="0" max="10000" value={editableWorkspaceSettings.accountsPerDay} onChange={(e) => updateWorkspaceDraft({ accountsPerDay: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Mailboxes per day">
            <input className="input-field compact" type="number" min="0" max="10000" value={editableWorkspaceSettings.mailboxCreatePerDay} onChange={(e) => updateWorkspaceDraft({ mailboxCreatePerDay: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Inbox refresh per minute">
            <input className="input-field compact" type="number" min="0" max="1000" value={editableWorkspaceSettings.inboxRefreshPerMinute} onChange={(e) => updateWorkspaceDraft({ inboxRefreshPerMinute: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        {usageSummary ? <UsageStrip usage={usageSummary} /> : null}
        <div className="settings-actions">
          <span>{mailProviderStatus}</span>
          <button type="button" className="secondary-button" onClick={onCheckMailboxProviderHealth} disabled={isSavingSettings || !canManageWorkspaceSettings}>
            Check mailbox provider
          </button>
        </div>
        <div className="settings-actions">
          <span>{canManageWorkspaceSettings ? 'Applies to everyone in this workspace.' : 'Workspace settings require owner or admin access.'}</span>
          <button type="button" className="primary-button" onClick={onSaveWorkspaceSettings} disabled={isSavingSettings || !workspaceSettings || !canManageWorkspaceSettings}>
            {isSavingSettings ? 'Saving' : 'Save workspace settings'}
          </button>
        </div>
      </section>
      ) : null}

      {settingsTab === 'invites' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>Invites</h3>
          <p>Create invite-only registration links and revoke pending access.</p>
        </div>

        <div className="member-add-row invite-create-row">
          <input
            className="input-field compact"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email for invite"
            disabled={!canManageWorkspaceSettings}
          />
          <select className={cn('input-field compact badge-select role-select', `tone-${roleTone(inviteRole)}`)} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as WorkspaceInvite['role'])} disabled={!canManageWorkspaceSettings}>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
          <button type="button" className="primary-button" onClick={onCreateInvite} disabled={isSavingSettings || !canManageWorkspaceSettings}>Create invite</button>
        </div>

        {lastInviteToken ? (
          <div className="invite-token-box">
            <span>Invite link</span>
            <code>{inviteLink || lastInviteToken}</code>
            <button type="button" className="micro-button" onClick={() => onCopy('invite-link', inviteLink || lastInviteToken)}>
              {copiedField === 'invite-link' ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : null}

        <div className="members-table-wrap">
          <table className="account-table members-table">
            <thead>
              <tr>
                <th>Invite</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workspaceInvites.map((invite) => (
                <tr key={invite.id}>
                  <td><strong>{invite.email || 'Open invite'}</strong><span>Expires {formatCompactDate(invite.expiresAt)}</span></td>
                  <td><span className={cn('badge', `tone-${roleTone(invite.role)}`)}>{invite.role}</span></td>
                  <td>
                    <span className={cn('badge', `tone-${inviteStatusTone(invite.status)}`)}>{invite.status}</span>
                    {invite.acceptedByLogin ? <span>by {invite.acceptedByLogin}</span> : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="micro-button"
                      onClick={() => onRevokeInvite(invite.id)}
                      disabled={!canManageWorkspaceSettings || isSavingSettings || invite.status !== 'pending'}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {workspaceInvites.length === 0 ? (
                <tr>
                  <td colSpan={4}>No invites yet</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="settings-actions">
          <span>{canManageWorkspaceSettings ? 'Invite links create new users directly inside this workspace.' : 'Invite management requires owner or admin access.'}</span>
        </div>
      </section>
      ) : null}

      {settingsTab === 'team' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>Team Members</h3>
          <p>Add existing users to the workspace and adjust their access level.</p>
        </div>

        <div className="member-add-row">
          <input
            className="input-field compact"
            value={memberLookup}
            onChange={(e) => setMemberLookup(e.target.value)}
            placeholder="login, email, or username"
            disabled={!canManageWorkspaceSettings}
          />
          <select className={cn('input-field compact badge-select role-select', `tone-${roleTone(memberRole)}`)} value={memberRole} onChange={(e) => setMemberRole(e.target.value as WorkspaceMember['workspaceRole'])} disabled={!canManageWorkspaceSettings}>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
          <button type="button" className="primary-button" onClick={onAddMember} disabled={isSavingSettings || !memberLookup.trim() || !canManageWorkspaceSettings}>Add member</button>
        </div>

        <div className="members-table-wrap">
          <table className="account-table members-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Workspace role</th>
                <th>System role</th>
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
                      value={member.workspaceRole}
                      onChange={(e) => onUpdateMemberRole(member.userId, e.target.value as WorkspaceMember['workspaceRole'])}
                      disabled={!canManageWorkspaceSettings || isSavingSettings}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td><span className={cn('badge', `tone-${roleTone(member.userRole)}`)}>{member.userRole}</span></td>
                  <td><button type="button" className="micro-button" onClick={() => onRemoveMember(member.userId)} disabled={!canManageWorkspaceSettings || isSavingSettings}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="settings-actions">
          <span>{canManageWorkspaceSettings ? 'Invites create new users; add member attaches an existing user.' : 'Member management requires owner or admin access.'}</span>
        </div>
      </section>
      ) : null}

      {settingsTab === 'security' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>Account Security</h3>
          <p>Email, username, password, and active sessions for your user account.</p>
        </div>

        <div className="settings-grid account-settings-grid">
          <Field label="Email">
            <input className="input-field compact" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="email" />
          </Field>
          <Field label="Username">
            <input className="input-field compact" value={accountUsername} onChange={(event) => setAccountUsername(event.target.value)} placeholder="username" />
          </Field>
        </div>
        <div className="settings-actions">
          <span>{accountStatus}</span>
          <button type="button" className="primary-button" onClick={onSaveAccountProfile} disabled={isSavingAccount || !accountEmail.trim() || !accountUsername.trim()}>
            {isSavingAccount ? 'Saving' : 'Save profile'}
          </button>
        </div>

        <div className="settings-grid password-settings-grid">
          <Field label="Current password">
            <input className="input-field compact" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password">
            <input className="input-field compact" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input className="input-field compact" type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="settings-actions">
          <span>Changing password revokes other active sessions.</span>
          <button type="button" className="primary-button" onClick={onChangeAccountPassword} disabled={isSavingAccount || !currentPassword || !newPassword || !confirmNewPassword}>
            {isSavingAccount ? 'Saving' : 'Change password'}
          </button>
        </div>

        <div className="members-table-wrap">
          <table className="account-table sessions-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>IP</th>
                <th>Last seen</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {authSessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.isCurrent ? 'Current session' : 'Active session'}</strong><span>{session.userAgent || 'Unknown client'}</span></td>
                  <td>{session.ipAddress || '—'}</td>
                  <td>{formatCompactDate(session.lastSeenAt || session.createdAt)}</td>
                  <td>{formatCompactDate(session.expiresAt)}</td>
                  <td>
                    <button type="button" className="micro-button" onClick={() => onRevokeSession(session.id)} disabled={isSavingAccount}>
                      {session.isCurrent ? 'Logout' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
              {authSessions.length === 0 ? (
                <tr>
                  <td colSpan={5}>No active sessions</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="settings-actions danger-actions">
          <span>Revokes every active session for this account, including this browser.</span>
          <button type="button" className="secondary-button danger-button" onClick={onLogoutEverywhere} disabled={isSavingAccount}>Logout everywhere</button>
        </div>
      </section>
      ) : null}

      {settingsTab === 'analytics' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>Workspace Analytics</h3>
          <p>Operational counters from local generation, mailbox, and inbox usage events.</p>
        </div>

        {analyticsSummary ? (
          <>
            <div className="analytics-metric-grid">
              <Metric label="Generated 7d" value={String(analyticsSummary.totals.generatedTotal)} />
              <Metric label="Generated 24h" value={String(analyticsSummary.totals.generated24h)} />
              <Metric label="Email received" value={String(analyticsSummary.totals.emailReceived)} />
              <Metric label="Verified docs" value={String(analyticsSummary.totals.verifiedDocuments)} />
              <Metric label="Review docs" value={String(analyticsSummary.totals.reviewDocuments)} />
            </div>

            <div className="analytics-grid">
              <section className="analytics-card">
                <h4>Usage events</h4>
                {analyticsSummary.usageByDay.length ? analyticsSummary.usageByDay.map((item) => (
                  <div key={`${item.day}:${item.eventType}`} className="analytics-row">
                    <span>{item.day}</span>
                    <strong>{item.eventType.replaceAll('_', ' ')}</strong>
                    <small>{item.total}</small>
                  </div>
                )) : <div className="empty-state compact">No usage events yet.</div>}
              </section>

              <section className="analytics-card">
                <h4>Top GEOs</h4>
                {analyticsSummary.topGeos.length ? analyticsSummary.topGeos.map((item) => (
                  <div key={item.geoKey} className="analytics-row">
                    <span>{item.geoLabel}</span>
                    <strong>{item.geoKey}</strong>
                    <small>{item.count}</small>
                  </div>
                )) : <div className="empty-state compact">No generated GEOs yet.</div>}
              </section>
            </div>
          </>
        ) : <SettingsSectionSkeleton />}

        <div className="section-subhead">
          <h3>Active Alerts</h3>
          <p>Limit and dataset warnings generated from the current workspace state.</p>
        </div>
        {alertItems.length ? <AlertsPanel items={alertItems} /> : <div className="empty-state compact">No active alerts.</div>}
      </section>
      ) : null}

      {settingsTab === 'activity' ? (
      <section className="settings-section settings-tab-panel">
        <div className="section-subhead">
          <h3>Activity Log</h3>
          <p>Workspace actions across generation, sharing, invites, members, workspaces, and sessions.</p>
        </div>
        <div className="account-table-wrap activity-table-wrap">
          <table className="account-table activity-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {activityItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.summary}</strong>
                    <span>{activityEventLabel(item.eventType)}</span>
                  </td>
                  <td>{item.actorLogin || `User ${item.userId}`}</td>
                  <td>{item.entityType ? `${item.entityType}${item.entityId ? ` #${item.entityId}` : ''}` : 'Workspace'}</td>
                  <td>{formatCompactDate(item.createdAt)}</td>
                </tr>
              ))}
              {activityItems.length === 0 ? (
                <tr>
                  <td colSpan={4}>No workspace activity yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      <div className="settings-save-note">
        Browser cache is still used for fast reloads, but backend settings are the source of truth after sign in.
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

function activityEventLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function UsagePill({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="usage-pill">
      <span>{label}</span>
      <strong>{used} / {limit}</strong>
    </div>
  );
}

function UsageStrip({ usage }: { usage: UsageSummary }) {
  return (
    <div className="usage-strip">
      <UsagePill label="Accounts today" used={usage.limits.accountsPerDay.used} limit={usage.limits.accountsPerDay.limit} />
      <UsagePill label="Mailboxes today" used={usage.limits.mailboxesPerDay.used} limit={usage.limits.mailboxesPerDay.limit} />
      <UsagePill label="Inbox / min" used={usage.limits.inboxRefreshPerMinute.used} limit={usage.limits.inboxRefreshPerMinute.limit} />
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
}: {
  detail: Detail;
  activationLink: string;
  onActivate: () => void;
  onCopyEmail: () => void;
  copied: boolean;
  onWaitRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const hasEmail = detail.inbox.status === 'email_received' && Boolean(detail.inbox.subject || detail.inbox.plainText || detail.inbox.rawHtml);
  const emailHtml = detail.inbox.rawHtml ? buildEmailSrcDoc(detail.inbox.rawHtml) : '';

  return (
    <section className="email-message-card">
      <div className="email-message-toolbar">
        <div>
          <h3>Mailbox message</h3>
          <p>{hasEmail ? 'Original inbox message' : 'No message captured yet'}</p>
        </div>
        <div className="email-message-actions">
          {onWaitRefresh ? (
            <button className="micro-button" onClick={onWaitRefresh} disabled={Boolean(isRefreshing)}>
              {isRefreshing ? 'Waiting' : 'Wait & refresh'}
            </button>
          ) : null}
          <button className="micro-button" onClick={onActivate} disabled={!activationLink}>Open verification</button>
          <button className="micro-button icon-copy-button" onClick={onCopyEmail} disabled={!hasEmail} aria-label="Copy email text" title={copied ? 'Copied' : 'Copy email text'}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      {hasEmail ? (
        <article className="email-message">
          <div className="email-message-meta">
            <div>
              <span>From</span>
              <strong>{detail.inbox.sender || 'Unknown sender'}</strong>
            </div>
            <div>
              <span>Subject</span>
              <strong>{detail.inbox.subject || 'No subject'}</strong>
            </div>
            <div>
              <span>Received</span>
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
          <strong>{statusLabel(mapDetailStatus(detail))}</strong>
          <span>Refresh inbox after the registration email is sent.</span>
          {onWaitRefresh ? <button className="primary-button" onClick={onWaitRefresh} disabled={Boolean(isRefreshing)}>{isRefreshing ? 'Waiting for email' : 'Wait & refresh inbox'}</button> : null}
        </div>
      )}
    </section>
  );
}

function StandaloneInbox({ inbox, address }: { inbox: MailboxInbox | null; address: string }) {
  const hasEmail = inbox?.status === 'email_received' && Boolean(inbox.subject || inbox.plainText || inbox.rawHtml);
  const emailHtml = inbox?.rawHtml ? buildEmailSrcDoc(inbox.rawHtml) : '';

  if (!inbox) {
    return (
      <div className="email-empty-state">
        <strong>Inbox ready</strong>
        <span>Refresh after sending mail to {address}.</span>
      </div>
    );
  }

  if (!hasEmail) {
    return (
      <div className="email-empty-state">
        <strong>{statusLabel(inbox.status === 'email_received' ? 'email_received' : 'waiting')}</strong>
        <span>No messages in this temporary inbox yet.</span>
      </div>
    );
  }

  return (
    <article className="email-message">
      <div className="email-message-meta">
        <div>
          <span>From</span>
          <strong>{inbox.sender || 'Unknown sender'}</strong>
        </div>
        <div>
          <span>Subject</span>
          <strong>{inbox.subject || 'No subject'}</strong>
        </div>
        <div>
          <span>Received</span>
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
  return `<!doctype html>
<html>
<head>
  <base target="_blank">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
    body { padding: 16px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    a { color: #0f766e; }
  </style>
</head>
<body>${rawHtml}</body>
</html>`;
}

function InspectorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="inspector-group">
      <div className="inspector-group-title">{title}</div>
      <div className="inspector-rows">{children}</div>
    </section>
  );
}

function BalanceStatusField({ value, onChange }: { value: AccountBalanceStatus; onChange: (value: AccountBalanceStatus) => void }) {
  return (
    <label className="account-id-field">
      <span>Balance status</span>
      <BalanceStatusSelect value={value} onChange={onChange} />
    </label>
  );
}

function BalanceStatusSelect({ value, onChange }: { value: AccountBalanceStatus; onChange: (value: AccountBalanceStatus) => void }) {
  return (
    <select
      className={cn('input-field compact badge-select balance-status-select', `tone-${balanceStatusTone(value)}`)}
      value={value}
      aria-label="Balance status"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as AccountBalanceStatus)}
    >
      {BALANCE_STATUS_OPTIONS.map((item) => (
        <option key={item.value} value={item.value}>{item.label}</option>
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
}) {
  return (
    <label className="account-id-field">
      <span>Phone</span>
      <div>
        <input
          className="input-field compact"
          value={value}
          onBlur={canEdit ? onSave : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          placeholder="Paste phone number"
          readOnly={!canEdit}
        />
        <div className="inline-actions">
          {canEdit ? (
            <>
              <button type="button" className="micro-button" onClick={onSave} disabled={!isSaving}>Save</button>
              <button type="button" className="micro-button icon-copy-button" onClick={onRegenerate} disabled={isRegenerating} aria-label="Regenerate phone" title="Regenerate phone">
                <RefreshIcon />
              </button>
            </>
          ) : null}
          <button type="button" className="micro-button icon-copy-button" onClick={onCopy} aria-label="Copy Phone" title={copied ? 'Copied' : 'Copy'}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>
    </label>
  );
}

function SharingField({ item, canManage, onToggle }: { item: Detail; canManage: boolean; onToggle: (shared: boolean) => void }) {
  return (
    <label className="account-id-field">
      <span>Workspace sharing</span>
      <SharingControl item={item} canManage={canManage} onToggle={onToggle} />
    </label>
  );
}

function SharingControl({
  item,
  canManage,
  onToggle,
}: {
  item: Pick<HistoryItem, 'createdByLogin' | 'sharedWithWorkspace'> | Pick<Detail, 'createdByLogin' | 'sharedWithWorkspace'>;
  canManage: boolean;
  onToggle: (shared: boolean) => void;
}) {
  const shared = isWorkspaceShared(item);
  return (
    <div className="sharing-control">
      <span className={cn('badge', `tone-${scopeTone(item)}`)}>
        {scopeLabel(item)}
      </span>
      {canManage ? (
        <button type="button" className="micro-button" onClick={(event) => {
          event.stopPropagation();
          onToggle(!shared);
        }}>
          {shared ? 'Make private' : 'Share'}
        </button>
      ) : (
        <span className="sharing-owner">{item.createdByLogin ? `by ${item.createdByLogin}` : 'read only'}</span>
      )}
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
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
  sensitive?: boolean;
  action?: React.ReactNode;
}) {
  const display = sensitive ? (hidden ? '••••••••••••' : value) : value;

  return (
    <div className="inspector-row">
      <div className="inspector-label">{label}</div>
      <div className="inspector-value">{display || '—'}</div>
      <div className="inspector-actions">
        {sensitive && onToggleHidden ? <button className="micro-button" onClick={onToggleHidden}>{hidden ? 'Reveal' : 'Hide'}</button> : null}
        {action}
        <button className="micro-button icon-copy-button" onClick={onCopy} aria-label={`Copy ${label}`} title={copied ? 'Copied' : 'Copy'}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
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
