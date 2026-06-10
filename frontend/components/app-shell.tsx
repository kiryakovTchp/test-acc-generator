'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, type GeoItem, type HistoryItem, type UserInfo } from '@/lib/api';

type PersonaKey = 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';
type NavKey = 'accounts' | 'mailboxes' | 'profiles' | 'codes' | 'activity' | 'settings';
type HistoryStatus = 'generated' | 'email_received' | 'waiting';

interface Detail {
  id: number;
  geoKey: string;
  geoLabel: string;
  email: string;
  emailPassword: string;
  username: string;
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
  { key: 'profiles', label: 'Profiles', short: 'PF' },
  { key: 'codes', label: 'Verification Codes', short: 'VC' },
  { key: 'activity', label: 'Activity Log', short: 'AL' },
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
  const [selectedGeo, setSelectedGeo] = useState('zambia');
  const [documentType, setDocumentType] = useState('passport');
  const [bulkCount, setBulkCount] = useState(5);
  const [persona, setPersona] = useState<PersonaKey>('standard_user');
  const [accountRole, setAccountRole] = useState<'admin' | 'user'>('user');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRawProfile, setShowRawProfile] = useState(false);
  const [showRawHtml, setShowRawHtml] = useState(false);
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
      const matchesSearch = !term || [item.username, item.email, item.geoLabel].some((value) => value.toLowerCase().includes(term));
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
      setShowRawProfile(false);
      setShowRawHtml(false);
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
      setShowRawProfile(false);
      setShowRawHtml(false);
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

  async function loadDebugDetail(id: number) {
    const next = await apiFetch<Detail>(`/history/${id}?debug=1`, token);
    setDetail(next);
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

  async function remove(id: number) {
    await apiFetch<void>(`/history/${id}`, token, { method: 'DELETE' });
    if (detail?.id === id) setDetail(null);
    await refresh();
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    window.setTimeout(() => setCopiedField((current) => current === key ? '' : current), 1500);
  }

  function copyIdentityPack() {
    if (!detail) return;
    const identityPack = [
      `Username: ${detail.username}`,
      `Email: ${detail.email}`,
      `Mailbox Password: ${detail.emailPassword}`,
      `Full Name: ${detail.firstName} ${detail.lastName}`,
      `Date of Birth: ${detail.dateOfBirth}`,
      `Phone: ${detail.phone}`,
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
          <h1>Test Account Generator</h1>
          <p>Generate accounts, inspect mailbox activity, and capture verification data.</p>
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
            <div className="sidebar-brand-mark">TG</div>
            <div>
              <strong>Test Generator</strong>
              <span>QA operations</span>
            </div>
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
        <div className="topbar command-bar">
          <div className="command-context">
            <div className="section-kicker">Accounts</div>
            <h1>Operator workspace</h1>
            <div className="command-meta">
              <span>{history.length} accounts</span>
              <span>{recentCount} last 24h</span>
              <span>{geoItems.length} GEO rules</span>
              {detail ? <span>Selected: {detail.username}</span> : <span>No selection</span>}
            </div>
          </div>
          <div className="topbar-actions" aria-label="Primary account actions">
            <button className="primary-button" onClick={generate} disabled={isGenerateDisabled} title="G">
              <kbd>G</kbd>{isGenerating ? 'Creating...' : 'Create'}
            </button>
            <button className="secondary-button" onClick={generateBulk} disabled={isGenerateDisabled} title="B">
              <kbd>B</kbd>{isBulkGenerating ? `Generating ${bulkCount}` : `Bulk ${bulkCount}`}
            </button>
            <button className="secondary-button" onClick={() => refreshInboxForDetail(0)} disabled={primaryActionsDisabled || isRefreshingInbox} title="R">
              <kbd>R</kbd>{isRefreshingInbox ? 'Refreshing' : 'Refresh inbox'}
            </button>
            <button className="secondary-button" onClick={copyIdentityPack} disabled={primaryActionsDisabled}>Copy pack</button>
          </div>
        </div>

        {error ? <div className="alert alert-error slim">{error}</div> : null}
        {isGenerating ? <div className="alert alert-info slim">Creating mailbox, credentials, and first inbox snapshot.</div> : null}
        {isBulkGenerating ? <div className="alert alert-info slim">Creating {bulkCount} accounts and mailbox snapshots.</div> : null}

        <div className="workspace-grid">
          <section className="panel panel-list">
            <div className="panel-header">
              <div>
                <div className="section-kicker">Accounts</div>
                <h2>Recent generated accounts</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setShowFilters((value) => !value)}>{showFilters ? 'Hide controls' : 'Show controls'}</button>
            </div>

            {showFilters ? (
              <div className="list-controls">
                <input className="input-field compact" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search username, email, GEO" />
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

            <div className="account-list-meta">
              <span>{filteredHistory.length} visible</span>
              <span>{recentCount} recent</span>
            </div>

            <div className="account-list">
              {filteredHistory.length ? filteredHistory.map((item) => {
                const rowStatus = mapHistoryStatus(item);
                const selected = detail?.id === item.id;
                return (
                  <button key={item.id} type="button" className={cn('account-row', selected && 'is-selected')} onClick={() => loadDetail(item.id)}>
                    <div className="account-row-main">
                      <div>
                        <div className="account-row-title">{item.username}</div>
                        <div className="account-row-subtitle">{item.email}</div>
                      </div>
                      <span className={cn('status-dot', `tone-${statusTone(rowStatus)}`)} />
                    </div>
                    <div className="account-row-meta">
                      <span>{statusLabel(rowStatus)}</span>
                      <span>{formatCompactDate(item.createdAt)}</span>
                    </div>
                  </button>
                );
              }) : <div className="empty-state">No accounts match the current filters.</div>}
            </div>
          </section>

          <section className="panel panel-detail">
            <div className="panel-header sticky">
              <div>
                <div className="section-kicker">Selected account</div>
                <h2>{detail ? detail.username : 'No account selected'}</h2>
              </div>
              {detail ? <div className={cn('status-pill', `tone-${statusTone(selectedStatus)}`)}>{statusLabel(selectedStatus)}</div> : null}
            </div>

            {!detail ? (
              <div className="empty-workspace">
                <h3>Generate an account or open one from the list</h3>
                <p>The center panel keeps credentials, identity data, verification links, and codes on a single working surface.</p>
              </div>
            ) : (
              <div className="detail-stack">
                <section className="inspector-card">
                  <div className="inspector-head">
                    <div>
                      <div className="section-kicker">Inspector</div>
                      <h3>{detail.firstName} {detail.lastName}</h3>
                    </div>
                    <div className="summary-metrics">
                      <Metric label="GEO" value={detail.geoLabel} />
                      <Metric label="Created" value={formatCompactDate(detail.createdAt)} />
                      <Metric label="Mailbox" value={statusLabel(selectedStatus)} />
                    </div>
                  </div>

                  <div className="inspector-grid">
                    <InspectorGroup title="Credentials">
                      <InspectorRow label="Username" value={detail.username} onCopy={() => copyValue(`username:${detail.id}`, detail.username)} copied={copiedField === `username:${detail.id}`} />
                      <InspectorRow label="Email" value={detail.email} onCopy={() => copyValue(`email:${detail.id}`, detail.email)} copied={copiedField === `email:${detail.id}`} />
                      <InspectorRow label="Mailbox password" value={detail.emailPassword} hidden={!showPassword} onToggleHidden={() => setShowPassword((v) => !v)} onCopy={() => copyValue(`mailbox-password:${detail.id}`, detail.emailPassword)} copied={copiedField === `mailbox-password:${detail.id}`} sensitive />
                      <InspectorRow label="Role" value={detail.role} onCopy={() => copyValue(`role:${detail.id}`, detail.role)} copied={copiedField === `role:${detail.id}`} />
                    </InspectorGroup>

                    <InspectorGroup title="Person">
                      <InspectorRow label="Full name" value={`${detail.firstName} ${detail.lastName}`} onCopy={() => copyValue(`name:${detail.id}`, `${detail.firstName} ${detail.lastName}`)} copied={copiedField === `name:${detail.id}`} />
                      <InspectorRow label="Date of birth" value={detail.dateOfBirth} onCopy={() => copyValue(`dob:${detail.id}`, detail.dateOfBirth)} copied={copiedField === `dob:${detail.id}`} />
                      <InspectorRow label="Gender" value={detail.gender} onCopy={() => copyValue(`gender:${detail.id}`, detail.gender)} copied={copiedField === `gender:${detail.id}`} />
                      <InspectorRow label="Phone" value={detail.phone} onCopy={() => copyValue(`phone:${detail.id}`, detail.phone)} copied={copiedField === `phone:${detail.id}`} />
                    </InspectorGroup>

                    <InspectorGroup title="Location">
                      <InspectorRow label="Country" value={detail.country} onCopy={() => copyValue(`country:${detail.id}`, detail.country)} copied={copiedField === `country:${detail.id}`} />
                      <InspectorRow label="Region" value={detail.region} onCopy={() => copyValue(`region:${detail.id}`, detail.region)} copied={copiedField === `region:${detail.id}`} />
                      <InspectorRow label="City" value={detail.city} onCopy={() => copyValue(`city:${detail.id}`, detail.city)} copied={copiedField === `city:${detail.id}`} />
                      <InspectorRow label="Address" value={detail.addressLine} onCopy={() => copyValue(`addr:${detail.id}`, detail.addressLine)} copied={copiedField === `addr:${detail.id}`} />
                      <InspectorRow label="Postal code" value={detail.postalCode} onCopy={() => copyValue(`postal:${detail.id}`, detail.postalCode)} copied={copiedField === `postal:${detail.id}`} />
                      <InspectorRow label="Place of birth" value={detail.placeOfBirth} onCopy={() => copyValue(`pob:${detail.id}`, detail.placeOfBirth)} copied={copiedField === `pob:${detail.id}`} />
                    </InspectorGroup>

                    <InspectorGroup title="Document">
                      <InspectorRow label="Type" value={detail.documentType} onCopy={() => copyValue(`doc-type:${detail.id}`, detail.documentType)} copied={copiedField === `doc-type:${detail.id}`} />
                      <InspectorRow label="Value" value={detail.documentValue} onCopy={() => copyValue(`doc:${detail.id}`, detail.documentValue)} copied={copiedField === `doc:${detail.id}`} />
                      <InspectorRow label="Issue date" value={detail.documentIssueDate} onCopy={() => copyValue(`issue:${detail.id}`, detail.documentIssueDate)} copied={copiedField === `issue:${detail.id}`} />
                      <InspectorRow label="Quality" value={detail.documentQuality} onCopy={() => copyValue(`quality:${detail.id}`, detail.documentQuality)} copied={copiedField === `quality:${detail.id}`} />
                    </InspectorGroup>
                  </div>
                </section>

                <section className="detail-card">
                  <div className="detail-card-header">
                    <h3>Verification links</h3>
                  </div>
                  <div className="link-list">
                    {detail.inbox.links.length ? detail.inbox.links.map((link) => (
                      <div key={link.url} className="link-row">
                        <div className="link-row-main">
                          <div className="link-row-title">{link.label || (link.isPrimary ? 'Primary verification link' : 'Verification link')}</div>
                          <div className="link-row-url">{expandedLink === link.url ? link.url : truncate(link.url, 72)}</div>
                        </div>
                        <div className="link-row-meta">
                          <span>{formatCompactDate(detail.inbox.receivedAt)}</span>
                          {link.isPrimary ? <span className="tag">Primary</span> : null}
                        </div>
                        <div className="link-row-actions">
                          <button className="micro-button" onClick={() => window.open(link.url, '_blank')}>Open</button>
                          <button className="micro-button" onClick={() => copyValue(`link:${link.url}`, link.url)}>{copiedField === `link:${link.url}` ? 'Copied' : 'Copy'}</button>
                          <button className="micro-button" onClick={() => setExpandedLink((current) => current === link.url ? '' : link.url)}>{expandedLink === link.url ? 'Hide' : 'View'}</button>
                        </div>
                      </div>
                    )) : <div className="empty-state compact">No verification links captured yet.</div>}
                  </div>
                </section>

                <section className="detail-card">
                  <div className="detail-card-header">
                    <h3>Verification codes</h3>
                  </div>
                  <div className="code-grid">
                    {detail.inbox.codes.length ? detail.inbox.codes.map((code) => (
                      <button key={code} type="button" className="code-tile" onClick={() => copyValue(`code:${code}`, code)}>
                        <span>{code}</span>
                        <small>{copiedField === `code:${code}` ? 'Copied' : 'Copy code'}</small>
                      </button>
                    )) : <div className="empty-state compact">No verification codes found.</div>}
                  </div>
                </section>

                <section className="detail-card">
                  <div className="detail-card-header">
                    <h3>Mailbox</h3>
                    <div className="inline-actions">
                      <button className="micro-button" onClick={() => refreshInboxForDetail(60000)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Waiting…' : 'Wait 60s'}</button>
                    </div>
                  </div>
                  <div className="mailbox-meta">
                    <span className={cn('status-pill', `tone-${statusTone(selectedStatus)}`)}>{isRefreshingInbox ? 'Waiting for email' : inboxStatusLabel || statusLabel(selectedStatus)}</span>
                    <span>Sender: {detail.inbox.sender || '—'}</span>
                    <span>Subject: {detail.inbox.subject || '—'}</span>
                    <span>Received: {formatDate(detail.inbox.receivedAt)}</span>
                  </div>
                  <div className="mailbox-body">{detail.inbox.plainText || 'No email yet. Use the generated account, then refresh the inbox.'}</div>
                  <div className="collapsible-area">
                    <button className="ghost-button" onClick={async () => {
                      const next = !showRawProfile;
                      setShowRawProfile(next);
                    }}>{showRawProfile ? 'Hide raw profile' : 'View raw profile'}</button>
                    <button className="ghost-button" onClick={async () => {
                      const next = !showRawHtml;
                      setShowRawHtml(next);
                      if (next && detail && !detail.inbox.rawHtml) {
                        await loadDebugDetail(detail.id);
                      }
                    }}>{showRawHtml ? 'Hide raw HTML' : 'View raw HTML'}</button>
                  </div>
                  {showRawProfile ? <pre className="debug-block">{detail.fullProfileText}</pre> : null}
                  {showRawHtml ? <pre className="debug-block">{detail.inbox.rawHtml ?? 'No HTML loaded.'}</pre> : null}
                </section>
              </div>
            )}
          </section>

          <aside className="panel panel-side">
            <div className="panel-header">
              <div>
                <div className="section-kicker">Operations</div>
                <h2>Run settings</h2>
              </div>
            </div>

            <section className="side-card">
              <h3>Generation parameters</h3>
              <div className="form-stack">
                <Field label="GEO">
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
                <Field label="Role">
                  <select className="input-field compact" value={accountRole} onChange={(e) => setAccountRole(e.target.value as 'admin' | 'user')}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </Field>
                <div className="shortcut-strip">
                  <span><kbd>G</kbd> create</span>
                  <span><kbd>B</kbd> bulk</span>
                  <span><kbd>R</kbd> inbox</span>
                </div>
              </div>
            </section>

            <section className="side-card">
              <h3>Activity feed</h3>
              <div className="timeline">
                {detail ? [
                  { label: 'Account generated', value: formatDate(detail.createdAt), tone: 'active' },
                  { label: 'Mailbox created', value: detail.email, tone: 'active' },
                  { label: 'Email received', value: detail.inbox.receivedAt || 'Pending', tone: detail.inbox.receivedAt ? 'success' : 'warning' },
                  { label: 'Code captured', value: detail.inbox.codes[0] || 'Pending', tone: detail.inbox.codes.length ? 'success' : 'warning' },
                  { label: 'Link captured', value: detail.inbox.primaryVerificationLink?.label || 'Pending', tone: detail.inbox.primaryVerificationLink ? 'success' : 'warning' },
                ].map((event) => (
                  <div key={event.label} className="timeline-item">
                    <span className={cn('status-dot', `tone-${event.tone}`)} />
                    <div>
                      <strong>{event.label}</strong>
                      <p>{event.value}</p>
                    </div>
                  </div>
                )) : <div className="empty-state compact">Select an account to see live activity.</div>}
              </div>
            </section>

            <section className="side-card compact-metrics">
              <Metric label="History" value={String(history.length)} />
              <Metric label="GEOs" value={String(geoItems.length)} />
              <Metric label="Codes" value={String(detail?.inbox.codes.length ?? 0)} />
              <Metric label="Links" value={String(detail?.inbox.links.length ?? 0)} />
            </section>

            {detail ? (
              <section className="side-card utility-actions">
                <button className="secondary-button w-full" onClick={() => remove(detail.id)}>Delete selected account</button>
              </section>
            ) : null}
          </aside>
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
        <button className="micro-button" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}
