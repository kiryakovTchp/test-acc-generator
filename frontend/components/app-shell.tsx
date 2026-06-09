'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, type GeoItem, type HistoryItem, type UserInfo } from '@/lib/api';

type PersonaKey = 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';

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
  city: string;
  addressLine: string;
  postalCode: string;
  persona: PersonaKey;
  role: 'admin' | 'user';
  documentType: string;
  documentValue: string;
  documentQuality: 'verified' | 'synthetic_pattern' | 'missing_rules';
  registrationUrl: string;
  registrationUrlStatus: 'real' | 'placeholder';
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
  { value: 'standard_user', label: 'Standard User: 25–40' },
  { value: 'young_user', label: 'Young User: 18–24' },
  { value: 'senior_user', label: 'Senior User: 55+' },
  { value: 'male_user', label: 'Male User' },
  { value: 'female_user', label: 'Female User' },
];

const FLOW_STEPS = [
  'Generate account',
  'Open registration',
  'Use credentials',
  'Refresh or wait for inbox',
  'Confirm by code or verification link',
];

export default function AppShell() {
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [geoItems, setGeoItems] = useState<GeoItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedGeo, setSelectedGeo] = useState('zambia');
  const [documentType, setDocumentType] = useState('passport');
  const [persona, setPersona] = useState<PersonaKey>('standard_user');
  const [accountRole, setAccountRole] = useState<'admin' | 'user'>('user');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedLink, setExpandedLink] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string>('');
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const [inboxStatusLabel, setInboxStatusLabel] = useState('');

  useEffect(() => {
    const storedToken = window.localStorage.getItem('tag-token') ?? '';
    const storedUser = window.localStorage.getItem('tag-user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    refresh(token).catch((err) => setError(err.message));
  }, [token]);

  const currentGeo = useMemo(() => geoItems.find((item) => item.key === selectedGeo), [geoItems, selectedGeo]);
  const currentStep = detail ? (detail.inbox.status === 'email_received' ? 5 : 4) : 1;

  useEffect(() => {
    if (currentGeo?.documentTypes.length) {
      setDocumentType(currentGeo.documentTypes[0]);
    }
  }, [currentGeo?.key]);

  async function refresh(authToken = token) {
    const [geo, historyRes] = await Promise.all([
      apiFetch<{ items: GeoItem[] }>('/geo-rules', authToken),
      apiFetch<{ items: HistoryItem[] }>('/history', authToken),
    ]);
    setGeoItems(geo.items);
    setHistory(historyRes.items);
    if (!selectedGeo && geo.items[0]) setSelectedGeo(geo.items[0].key);
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    window.localStorage.setItem('tag-token', res.token);
    window.localStorage.setItem('tag-user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  }

  async function generate() {
    setError('');
    const res = await apiFetch<Detail>('/accounts/generate', token, {
      method: 'POST',
      body: JSON.stringify({ geoKey: selectedGeo, documentType, role: accountRole, persona }),
    });
    setDetail(res);
    setShowFullProfile(false);
    await refresh();
  }

  async function loadDetail(id: number) {
    setDetail(await apiFetch<Detail>(`/history/${id}`, token));
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

  function QuickRow({ label, value, hidden = false }: { label: string; value: string; hidden?: boolean }) {
    const display = hidden && !showPassword ? '••••••••••••' : value;
    const key = `${label}:${value}`;
    return (
      <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
        <strong className="text-slate-300">{label}</strong>
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 break-all">{display}</div>
        <div className="flex gap-2">
          {hidden ? <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => setShowPassword((v) => !v)}>{showPassword ? 'Hide' : 'Reveal'}</button> : null}
          <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(key, value)}>{copiedField === key ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <form className="w-full space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6" onSubmit={doLogin}>
          <div>
            <h1 className="text-2xl font-semibold">Test Account Generator</h1>
            <p className="mt-2 text-sm text-slate-400">Sign in with your assigned credentials.</p>
          </div>
          <input className="w-full rounded-lg bg-slate-950 p-3" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" />
          <input className="w-full rounded-lg bg-slate-950 p-3" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <button className="w-full rounded-lg bg-sky-600 p-3 font-medium">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Test Account Generator</h1>
          <p className="text-sm text-slate-400">Mailbox-first registration testing workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Technical</summary>
            <div className="mt-2 rounded border border-slate-800 bg-slate-900 p-3">
              <div>User: {user.login}</div>
              <div>Role: {user.role}</div>
            </div>
          </details>
          <button className="rounded-lg border border-slate-700 px-4 py-2" onClick={() => { window.localStorage.clear(); setUser(null); setToken(''); }}>Logout</button>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-rose-200">{error}</p> : null}

      <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 text-sm text-slate-400">Current flow</div>
        <div className="grid gap-3 md:grid-cols-5">
          {FLOW_STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === currentStep;
            const done = stepNumber < currentStep;
            return (
              <div key={step} className={`rounded-xl border p-3 text-sm ${done ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : active ? 'border-sky-700 bg-sky-950/30 text-sky-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>
                <div className="mb-1 text-xs">Step {stepNumber}</div>
                <div>{step}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-xl font-semibold">Generate account</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">GEO</label>
                <select className="w-full rounded-lg bg-slate-950 p-3" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
                  {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Persona</label>
                <select className="w-full rounded-lg bg-slate-950 p-3" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
                  {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Document type</label>
                <select className="w-full rounded-lg bg-slate-950 p-3" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                  {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  <option value="missing_rule_probe">missing_rule_probe</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Account role</label>
                <select className="w-full rounded-lg bg-slate-950 p-3" value={accountRole} onChange={(e) => setAccountRole(e.target.value as 'admin' | 'user')}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button className="w-full rounded-lg bg-emerald-600 p-3 font-medium" onClick={generate}>Generate account</button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">History</h2>
              <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide' : 'Show'}</button>
            </div>
            {showHistory ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.geoLabel} • {item.documentType}</p>
                        <p className="text-sm text-slate-400">{item.email}</p>
                        <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-lg border border-slate-700 px-3 py-1 text-sm" onClick={() => loadDetail(item.id)}>Open</button>
                        <button className="rounded-lg border border-rose-800 px-3 py-1 text-sm text-rose-300" onClick={() => remove(item.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">Recent generated accounts live here when you need them.</p>}
          </section>
        </aside>

        <section className="space-y-6">
          {!detail ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
              Generate an account to start the registration flow.
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Current account workspace</h2>
                    <p className="text-sm text-slate-400">Use these details on the target registration form.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded border border-slate-700 px-3 py-2 text-sm" onClick={() => copyValue(`full-profile:${detail.id}`, detail.fullProfileText)}>{copiedField === `full-profile:${detail.id}` ? 'Copied full profile' : 'Copy Full Profile'}</button>
                    <a href={detail.registrationUrl} target="_blank" className="rounded bg-sky-600 px-3 py-2 text-sm font-medium">Open registration</a>
                  </div>
                </div>

                <div className="grid gap-3">
                  <QuickRow label="Email" value={detail.email} />
                  <QuickRow label="Password" value={detail.emailPassword} hidden />
                  <QuickRow label="Username" value={detail.username} />
                  <QuickRow label="Phone" value={detail.phone} />
                  <QuickRow label="Document" value={`${detail.documentType} = ${detail.documentValue}`} />
                  <QuickRow label="Registration URL" value={detail.registrationUrl} />
                </div>

                <div className="mt-4">
                  <button type="button" className="rounded border border-slate-700 px-3 py-2 text-sm" onClick={() => setShowFullProfile((v) => !v)}>{showFullProfile ? 'Hide full profile' : 'Show full profile'}</button>
                </div>

                {showFullProfile ? (
                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <QuickRow label="First name" value={detail.firstName} />
                    <QuickRow label="Last name" value={detail.lastName} />
                    <QuickRow label="Gender" value={detail.gender} />
                    <QuickRow label="Date of Birth" value={detail.dateOfBirth} />
                    <QuickRow label="Age" value={String(detail.age)} />
                    <QuickRow label="Country" value={detail.country} />
                    <QuickRow label="City" value={detail.city} />
                    <QuickRow label="Address" value={detail.addressLine} />
                    <QuickRow label="Postal Code" value={detail.postalCode} />
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Inbox verification</h2>
                    <p className="text-sm text-slate-400">After registration, refresh this mailbox and confirm by code or verification link.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded border border-slate-700 px-3 py-2 text-sm" onClick={() => refreshInboxForDetail(0)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Refreshing...' : 'Refresh Inbox'}</button>
                    <button type="button" className="rounded border border-slate-700 px-3 py-2 text-sm" onClick={() => refreshInboxForDetail(60000)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Waiting...' : 'Wait for Email (60s)'}</button>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-3 py-1 ${detail.inbox.status === 'email_received' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{isRefreshingInbox ? 'Waiting for email' : inboxStatusLabel || (detail.inbox.status === 'email_received' ? 'Email received' : 'No email found')}</span>
                  {detail.inbox.subject ? <span>Subject: {detail.inbox.subject}</span> : null}
                  {detail.inbox.sender ? <span>Sender: {detail.inbox.sender}</span> : null}
                  {detail.inbox.receivedAt ? <span>Received: {new Date(detail.inbox.receivedAt).toLocaleString()}</span> : null}
                </div>

                {detail.inbox.primaryVerificationLink ? (
                  <div className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/20 p-4">
                    <div className="mb-2 text-sm text-emerald-300">Primary verification link</div>
                    <div className="mb-3 font-medium text-slate-100">{detail.inbox.primaryVerificationLink.label || 'Verification link'}</div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium" onClick={() => window.open(detail.inbox.primaryVerificationLink!.url, '_blank')}>Open Verification Link</button>
                      <button type="button" className="rounded border border-slate-700 px-3 py-2 text-sm" onClick={() => copyValue(`primary:${detail.inbox.primaryVerificationLink!.url}`, detail.inbox.primaryVerificationLink!.url)}>{copiedField === `primary:${detail.inbox.primaryVerificationLink!.url}` ? 'Copied' : 'Copy'}</button>
                    </div>
                  </div>
                ) : null}

                {detail.inbox.codes.length ? (
                  <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 font-medium">Verification codes</div>
                    <div className="space-y-2">
                      {detail.inbox.codes.map((code) => (
                        <div key={code} className="flex items-center justify-between gap-2">
                          <span className="text-lg font-semibold tracking-wide">{code}</span>
                          <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(`code:${code}`, code)}>{copiedField === `code:${code}` ? 'Copied' : 'Copy'}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-2 font-medium">Email text</div>
                  <div className="whitespace-pre-wrap text-slate-300">{detail.inbox.plainText || 'No message received yet. Register on the target site, then use Refresh Inbox or Wait for Email.'}</div>
                </div>

                <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4" open={showDebug}>
                  <summary className="cursor-pointer font-medium" onClick={() => setShowDebug((v) => !v)}>Advanced / Debug</summary>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-2 font-medium">Links Found</div>
                      <div className="space-y-3">
                        {detail.inbox.links.map((link) => (
                          <div key={link.url} className="rounded border border-slate-800 p-3">
                            <div className="mb-1 font-medium text-slate-200">{link.label || 'Link'}</div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => window.open(link.url, '_blank')}>{link.isPrimary ? 'Open Verification Link' : 'Open Link'}</button>
                              <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(`link:${link.url}`, link.url)}>{copiedField === `link:${link.url}` ? 'Copied' : 'Copy'}</button>
                              <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => setExpandedLink((current) => current === link.url ? '' : link.url)}>{expandedLink === link.url ? 'Hide URL' : 'Show URL'}</button>
                            </div>
                            {expandedLink === link.url ? <div className="mt-2 break-all text-xs text-slate-400">{link.url}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 font-medium">Raw HTML</div>
                      <pre className="whitespace-pre-wrap text-xs text-slate-400">{detail.inbox.rawHtml ?? 'No HTML message'}</pre>
                    </div>
                  </div>
                </details>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
