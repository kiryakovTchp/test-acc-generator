'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, type GeoItem, type HistoryItem, type UserInfo } from '@/lib/api';

type PersonaKey = 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';
type NavKey = 'accounts' | 'mailboxes' | 'form_data' | 'codes' | 'settings';
type HistoryStatus = 'generated' | 'email_received' | 'waiting';

interface Detail {
  id: number;
  geoKey: string;
  geoLabel: string;
  email: string;
  emailPassword: string;
  username: string;
  siteAccountId: string;
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

const PERSONAS: Array<{ value: PersonaKey; label: string }> = [
  { value: 'standard_user', label: 'Standard User · 25–40' },
  { value: 'young_user', label: 'Young User · 18–24' },
  { value: 'senior_user', label: 'Senior User · 55+' },
  { value: 'male_user', label: 'Male User' },
  { value: 'female_user', label: 'Female User' },
];

const NAV_ITEMS: Array<{ key: NavKey; label: string; short: string }> = [
  { key: 'accounts', label: 'Accounts', short: 'AC' },
  { key: 'mailboxes', label: 'Mailboxes', short: 'MB' },
  { key: 'form_data', label: 'Form Data', short: 'FD' },
  { key: 'codes', label: 'Verification Codes', short: 'VC' },
  { key: 'settings', label: 'Settings', short: 'ST' },
];

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

function mapHistoryStatus(item: HistoryItem): HistoryStatus {
  if (item.inboxStatus === 'email_received') return 'email_received';
  if (item.inboxStatus === 'waiting_for_email' || item.inboxStatus === 'no_email_found') return 'waiting';
  return 'generated';
}

function mapDetailStatus(detail: Detail | null): HistoryStatus {
  if (!detail) return 'waiting';
  if (detail.inbox.status === 'email_received') return 'email_received';
  if (detail.inbox.status === 'no_email_found') return 'waiting';
  return 'generated';
}

function statusTone(status: HistoryStatus) {
  if (status === 'email_received') return 'success';
  if (status === 'generated') return 'active';
  return 'warning';
}

function statusLabel(status: HistoryStatus) {
  if (status === 'email_received') return 'Email received';
  if (status === 'generated') return 'Generated';
  return 'Waiting';
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  const storage = window.localStorage;
  if (!storage) return null;
  return typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    && typeof storage.removeItem === 'function'
    && typeof storage.clear === 'function'
    ? storage
    : null;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export default function AppShell() {
  const [activeNav, setActiveNav] = useState<NavKey>('accounts');
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [geoItems, setGeoItems] = useState<GeoItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedGeo, setSelectedGeo] = useState('south_sudan');
  const [documentType, setDocumentType] = useState('passport');
  const [bulkCount, setBulkCount] = useState(5);
  const [persona, setPersona] = useState<PersonaKey>('standard_user');
  const [accountRole, setAccountRole] = useState<'admin' | 'user'>('user');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [expandedLink, setExpandedLink] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [inboxStatusLabel, setInboxStatusLabel] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HistoryStatus>('all');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest'>('newest');
  const [siteAccountIdDraft, setSiteAccountIdDraft] = useState('');

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;

    const storedToken = storage.getItem('tag-token') ?? '';
    const storedUser = storage.getItem('tag-user');
    if (!storedToken || !storedUser) return;

    try {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    } catch {
      storage.removeItem('tag-token');
      storage.removeItem('tag-user');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    refresh(token).catch((err) => {
      if (err instanceof Error && /unauthorized/i.test(err.message)) {
        const storage = getBrowserStorage();
        storage?.removeItem('tag-token');
        storage?.removeItem('tag-user');
        setToken('');
        setUser(null);
        setError('Session expired. Please sign in again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load data');
    });
  }, [token]);

  const currentGeo = useMemo(() => geoItems.find((item) => item.key === selectedGeo), [geoItems, selectedGeo]);

  useEffect(() => {
    if (currentGeo?.documentTypes.length) {
      setDocumentType(currentGeo.documentTypes[0]);
    }
  }, [currentGeo?.key]);

  const filteredHistory = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    const next = history.filter((item) => {
      const status = mapHistoryStatus(item);
      const matchesSearch = !term || [item.username, item.email, item.geoLabel, item.siteAccountId].some((value) => value.toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    next.sort((a, b) => sortMode === 'newest'
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return next;
  }, [accountSearch, history, sortMode, statusFilter]);

  const selectedStatus = mapDetailStatus(detail);
  const primaryActionsDisabled = !detail;
  const recentCount = history.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 24 * 60 * 60 * 1000).length;
  const isGenerateDisabled = isGenerating || isBulkGenerating;
  const verificationLinks = detail?.inbox.links ?? [];
  const verificationCodes = detail?.inbox.codes ?? [];
  const verificationReceivedAt = detail?.inbox.receivedAt;
  const hasVerificationLinks = verificationLinks.length > 0;
  const hasVerificationCodes = verificationCodes.length > 0;

  useEffect(() => {
    setSiteAccountIdDraft(detail?.siteAccountId ?? '');
  }, [detail?.id, detail?.siteAccountId]);

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
        if (!primaryActionsDisabled && !isRefreshingInbox) void refreshInboxForDetail(0);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  async function refresh(authToken = token) {
    const [geo, historyRes] = await Promise.all([
      apiFetch<{ items: GeoItem[] }>('/geo-rules', authToken),
      apiFetch<{ items: HistoryItem[] }>('/history', authToken),
    ]);
    setGeoItems(geo.items);
    setHistory(historyRes.items);
    if ((!selectedGeo || !geo.items.some((item) => item.key === selectedGeo)) && geo.items[0]) {
      setSelectedGeo(geo.items[0].key);
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    const storage = getBrowserStorage();
    storage?.setItem('tag-token', res.token);
    storage?.setItem('tag-user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  }

  async function generate() {
    setError('');
    setIsGenerating(true);
    try {
      const res = await apiFetch<Detail>('/accounts/generate', token, {
        method: 'POST',
        body: JSON.stringify({ geoKey: selectedGeo, documentType, role: accountRole, persona }),
      });
      setDetail(res);
      setActiveNav('accounts');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate account');
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
        body: JSON.stringify({ geoKey: selectedGeo, documentType, role: accountRole, persona, count: bulkCount }),
      });
      const firstItem = res.items[0] ?? null;
      setDetail(firstItem);
      setActiveNav('accounts');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate accounts');
    } finally {
      setIsBulkGenerating(false);
    }
  }

  async function loadDetail(id: number) {
    setDetail(await apiFetch<Detail>(`/history/${id}`, token));
    setActiveNav('accounts');
  }

  async function refreshInboxForDetail(waitMs = 0) {
    if (!detail) return;
    setIsRefreshingInbox(true);
    setInboxStatusLabel(waitMs > 0 ? 'Waiting for email' : 'Checking inbox');
    setError('');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/refresh-inbox`, token, {
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

  async function saveSiteAccountId() {
    if (!detail || siteAccountIdDraft.trim() === (detail.siteAccountId ?? '')) return;
    setError('');
    try {
      const updated = await apiFetch<Detail>(`/history/${detail.id}/account-id`, token, {
        method: 'PATCH',
        body: JSON.stringify({ siteAccountId: siteAccountIdDraft }),
      });
      setDetail(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account ID');
    }
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    window.setTimeout(() => setCopiedField((current) => current === key ? '' : current), 1500);
  }

  function copyIdentityPack() {
    if (!detail) return;
    const identityPack = [
      `Account ID: ${detail.siteAccountId || ''}`,
      `Username: ${detail.username}`,
      `Email: ${detail.email}`,
      `Mailbox Password: ${detail.emailPassword}`,
      `First Name: ${detail.firstName}`,
      `Last Name: ${detail.lastName}`,
      `Date of Birth: ${detail.dateOfBirth}`,
      `Phone: ${detail.phone}`,
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

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={doLogin}>
          <div className="login-badge">Internal QA console</div>
          <h1>Registration Testing Workspace</h1>
          <p>Generate test accounts, fill registration forms, and capture mailbox verification data.</p>
          <div className="login-fields">
            <input className="input-field" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" />
            <input className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
          </div>
          {error ? <p className="alert alert-error">{error}</p> : null}
          <button className="primary-button w-full">Sign in</button>
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
              <strong>Registration Testing</strong>
              <span>Workspace console</span>
            </div>
          </div>

          <div className="flow-block">
            <div className="flow-label">Flow</div>
            <div className="flow-title">Registration Flow</div>
            <div className="flow-subtitle">Core registration with verification and inbox</div>
            <span className="flow-status">Active</span>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={cn('sidebar-nav-item', activeNav === item.key && 'is-active')}
                onClick={() => setActiveNav(item.key)}
              >
                <span className="sidebar-nav-short">{item.short}</span>
                <span>{item.label}</span>
                <span className="sidebar-count">
                  {item.key === 'accounts' ? history.length
                    : item.key === 'mailboxes' ? history.length
                      : item.key === 'form_data' ? recentCount
                        : item.key === 'codes' ? (detail?.inbox.codes.length ?? 0)
                          : ''}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user.login}</strong>
            <span>{user.role}</span>
          </div>
          <button className="sidebar-logout" onClick={() => { getBrowserStorage()?.clear(); setUser(null); setToken(''); }}>Logout</button>
        </div>
      </aside>

      <section className="workspace-shell">
        <div className="topbar">
          <div className="breadcrumb">
            <span>Flows</span>
            <span>Registration Flow</span>
            <strong>Core Flow</strong>
          </div>
          <div className="topbar-admin">
            <button className="icon-button" title="Command menu">CMD K</button>
            <div className="env-select"><span /> Environment · admin-live</div>
            <div className="env-select">{user.login}</div>
            <button className="logout-button" onClick={() => { getBrowserStorage()?.clear(); setUser(null); setToken(''); }}>Logout</button>
          </div>
        </div>

        {error ? <div className="alert alert-error slim">{error}</div> : null}
        {isGenerating ? <div className="alert alert-info slim">Creating mailbox, credentials, and first inbox snapshot.</div> : null}
        {isBulkGenerating ? <div className="alert alert-info slim">Creating {bulkCount} accounts and mailbox snapshots.</div> : null}

        <section className="quick-actions-panel">
          <div className="quick-actions-title">Quick actions</div>
          <div className="quick-actions-grid" aria-label="Primary account actions">
            <button className="action-card" onClick={generate} disabled={isGenerateDisabled} title="G">
              <span className="action-icon">+</span>
              <span><strong>{isGenerating ? 'Creating account' : 'Create account'}</strong><small>Single account</small></span>
              <kbd>G</kbd>
            </button>
            <button className="action-card" onClick={generateBulk} disabled={isGenerateDisabled} title="B">
              <span className="action-icon">B</span>
              <span><strong>{isBulkGenerating ? `Generating ${bulkCount}` : 'Generate bulk'}</strong><small>Multiple accounts</small></span>
              <kbd>B</kbd>
            </button>
            <button className="action-card" onClick={() => refreshInboxForDetail(0)} disabled={primaryActionsDisabled || isRefreshingInbox} title="R">
              <span className="action-icon">R</span>
              <span><strong>{isRefreshingInbox ? 'Refreshing inbox' : 'Refresh inbox'}</strong><small>Selected account</small></span>
              <kbd>R</kbd>
            </button>
            <button className="action-card" onClick={copyIdentityPack} disabled={primaryActionsDisabled}>
              <span className="action-icon">CP</span>
              <span><strong>Copy identity pack</strong><small>Registration form fields</small></span>
            </button>
            <button className="action-card" disabled>
              <span className="action-icon">URL</span>
              <span><strong>Open registration URL</strong><small>Not configured</small></span>
            </button>
          </div>
        </section>

        <div className="workspace-grid">
          <section className="panel panel-list">
            <div className="panel-header">
              <h2>Accounts <span>({history.length})</span></h2>
              <button type="button" className="filter-button" onClick={() => setShowFilters((value) => !value)}>F</button>
            </div>

            {showFilters ? (
              <div className="list-controls">
                <input className="input-field compact" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search accounts..." />
                <div className="control-row">
                  <select className="input-field compact" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | HistoryStatus)}>
                    <option value="all">All statuses</option>
                    <option value="generated">Generated</option>
                    <option value="email_received">Email received</option>
                    <option value="waiting">Waiting</option>
                  </select>
                  <select className="input-field compact" value={sortMode} onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest')}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className="account-list">
              {filteredHistory.length ? filteredHistory.map((item) => {
                const rowStatus = mapHistoryStatus(item);
                const selected = detail?.id === item.id;
                return (
                  <button key={item.id} type="button" className={cn('account-row', selected && 'is-selected')} onClick={() => loadDetail(item.id)}>
                    <span className={cn('status-dot', `tone-${statusTone(rowStatus)}`)} />
                    <strong>{item.siteAccountId || item.username}</strong>
                    <time>{formatCompactDate(item.createdAt)}</time>
                  </button>
                );
              }) : <div className="empty-state">No accounts match the current filters.</div>}
            </div>
            <button type="button" className="view-all-button">View all accounts</button>
          </section>

          <section className="panel panel-detail">
            <div className="panel-header">
              <h2>Account details {detail ? <span className="success-text">{statusLabel(selectedStatus)}</span> : null}</h2>
              <div className="panel-actions">
                <button className="micro-button" disabled>Open in site</button>
                <button className="micro-button">...</button>
              </div>
            </div>

            {!detail ? (
              <div className="empty-workspace">
                <h3>Generate an account or open one from the list</h3>
                <p>The selected account appears here without navigating away from the account list.</p>
              </div>
            ) : (
              <div className="detail-stack">
                <section className="registration-form-grid">
                  <div className="form-section">
                    <h3>Account</h3>
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
                    <InspectorRow label="Password" value={detail.emailPassword} hidden={!showPassword} onToggleHidden={() => setShowPassword((v) => !v)} onCopy={() => copyValue(`mailbox-password:${detail.id}`, detail.emailPassword)} copied={copiedField === `mailbox-password:${detail.id}`} sensitive />
                    <InspectorRow label="Username" value={detail.username} onCopy={() => copyValue(`username:${detail.id}`, detail.username)} copied={copiedField === `username:${detail.id}`} />
                    <InspectorRow label="Registration date" value={formatDate(detail.createdAt)} onCopy={() => copyValue(`created:${detail.id}`, formatDate(detail.createdAt))} copied={copiedField === `created:${detail.id}`} />
                    <InspectorRow label="Phone" value={detail.phone} onCopy={() => copyValue(`phone:${detail.id}`, detail.phone)} copied={copiedField === `phone:${detail.id}`} />
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
                  <div className="identity-pack-grid">
                    <InfoTile label="Name fields" value={`${detail.lastName}\n${detail.firstName}`} action="Copy" onClick={() => copyValue(`names:${detail.id}`, `${detail.firstName}\n${detail.lastName}`)} />
                    <InfoTile label="Region fields" value={`${detail.country}\n${detail.region}\n${detail.city}`} action="Copy" onClick={() => copyValue(`region-pack:${detail.id}`, `${detail.country}\n${detail.region}\n${detail.city}`)} />
                    <InfoTile label="Document" value={`${detail.documentType}\n${detail.documentValue}`} action="Copy" onClick={() => copyValue(`doc-tile:${detail.id}`, `${detail.documentType}\n${detail.documentValue}`)} />
                    <InfoTile label="Phone" value={detail.phone} action="Copy" onClick={() => copyValue(`phone:${detail.id}`, detail.phone)} />
                    <InfoTile label="Email" value={detail.email} action="Copy" onClick={() => copyValue(`email:${detail.id}`, detail.email)} />
                  </div>
                </section>
              </div>
            )}
          </section>

          <aside className="panel panel-side">
            <section className="side-card bulk-card">
              <h3>Generation settings</h3>
              <p>Shared settings used by Create Account and Generate Bulk.</p>
              <div className="form-stack">
                <Field label="GEO">
                  <select className="input-field compact" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
                    {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Form persona">
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
                <Field label="Bulk count">
                  <input
                    className="input-field compact"
                    type="number"
                    min="1"
                    max="25"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </Field>
              </div>
            </section>
          </aside>

          {hasVerificationLinks ? (
            <section className="panel panel-links">
              <div className="panel-header">
                <h2>Verification links <span>({verificationLinks.length})</span></h2>
              </div>
              <div className="link-list">
                {verificationLinks.map((link) => (
                <div key={link.url} className="link-row">
                  <span className="status-dot tone-success" />
                  <div className="link-row-main">
                    <div className="link-row-title">{link.label || (link.isPrimary ? 'Email verification' : 'Verification link')}</div>
                    <div className="link-row-url">{expandedLink === link.url ? link.url : truncate(link.url, 64)}</div>
                  </div>
                  <button className="copy-icon" onClick={() => copyValue(`link:${link.url}`, link.url)}>CP</button>
                  <time>{formatCompactDate(verificationReceivedAt)}</time>
                </div>
                ))}
              </div>
            </section>
          ) : null}

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
        </div>
      </section>
    </main>
  );
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
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

function InspectorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="inspector-group">
      <div className="inspector-group-title">{title}</div>
      <div className="inspector-rows">{children}</div>
    </section>
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
