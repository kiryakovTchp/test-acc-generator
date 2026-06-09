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
  { value: 'standard_user', label: 'Standard User · 25–40' },
  { value: 'young_user', label: 'Young User · 18–24' },
  { value: 'senior_user', label: 'Senior User · 55+' },
  { value: 'male_user', label: 'Male User' },
  { value: 'female_user', label: 'Female User' },
];

const FLOW_STEPS = [
  'Generate account',
  'Open registration',
  'Use credentials',
  'Wait for inbox',
  'Confirm email',
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
  const [showHistory, setShowHistory] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [expandedLink, setExpandedLink] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string>('');
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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
    setIsGenerating(true);
    try {
      const res = await apiFetch<Detail>('/accounts/generate', token, {
        method: 'POST',
        body: JSON.stringify({ geoKey: selectedGeo, documentType, role: accountRole, persona }),
      });
      setDetail(res);
      setShowFullProfile(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate account');
    } finally {
      setIsGenerating(false);
    }
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

  function QuickValue({ label, value, hidden = false }: { label: string; value: string; hidden?: boolean }) {
    const display = hidden && !showPassword ? '••••••••••••' : value;
    const key = `${label}:${value}`;
    return (
      <div className="rounded-2xl border border-[#d9e7d0] bg-white p-4 shadow-sm">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6f8161]">{label}</div>
        <div className="mb-3 break-all text-[15px] font-medium text-[#142f04]">{display}</div>
        <div className="flex gap-2">
          {hidden ? <button type="button" className="rounded-lg border border-[#c9d9c0] px-3 py-2 text-xs text-[#355c18]" onClick={() => setShowPassword((v) => !v)}>{showPassword ? 'Hide' : 'Reveal'}</button> : null}
          <button type="button" className="rounded-lg border border-[#c9d9c0] px-3 py-2 text-xs text-[#355c18]" onClick={() => copyValue(key, value)}>{copiedField === key ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <form className="w-full rounded-3xl border border-[#d9e7d0] bg-white p-8 shadow-lg" onSubmit={doLogin}>
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-[#142f04]">Test Account Generator</h1>
            <p className="mt-2 text-sm text-[#6f8161]">Sign in to generate a profile and verify registration emails.</p>
          </div>
          <div className="space-y-4">
            <input className="w-full rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-[#142f04]" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" />
            <input className="w-full rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-[#142f04]" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
          </div>
          {error ? <p className="mt-4 rounded-2xl border border-[#e6c1ba] bg-[#fff3f1] p-3 text-sm text-[#ad3725]">{error}</p> : null}
          <button className="mt-6 w-full rounded-2xl bg-[#55ce10] p-3 font-medium text-[#142f04] shadow-sm">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-[#142f04]">Test Account Generator</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#6f8161]">Generate a test profile, register on the target product, then confirm the account from the mailbox workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <details className="rounded-2xl border border-[#d9e7d0] bg-white px-4 py-3 text-xs text-[#6f8161] shadow-sm">
            <summary className="cursor-pointer">Technical</summary>
            <div className="mt-3 space-y-1">
              <div>User: {user.login}</div>
              <div>Role: {user.role}</div>
            </div>
          </details>
          <button className="rounded-2xl border border-[#d9e7d0] bg-white px-4 py-3 text-sm text-[#142f04] shadow-sm" onClick={() => { window.localStorage.clear(); setUser(null); setToken(''); }}>Logout</button>
        </div>
      </header>

      {error ? <div className="mb-6 rounded-2xl border border-[#e6c1ba] bg-[#fff3f1] p-4 text-sm text-[#ad3725] shadow-sm">{error}</div> : null}

      <section className="mb-8 rounded-3xl border border-[#d9e7d0] bg-white p-6 shadow-sm">
        <div className="mb-4 text-sm font-medium text-[#6f8161]">E2E flow</div>
        <div className="grid gap-3 md:grid-cols-5">
          {FLOW_STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === currentStep;
            const done = stepNumber < currentStep;
            return (
              <div key={step} className={`rounded-2xl border p-4 ${done ? 'border-[#bde3a5] bg-[#f1faeb]' : active ? 'border-[#2993a3] bg-[#eef7f9]' : 'border-[#e5efe0] bg-[#fafcf9]'}`}>
                <div className={`mb-2 text-xs font-medium uppercase tracking-wide ${done ? 'text-[#355c18]' : active ? 'text-[#2993a3]' : 'text-[#8aa07d]'}`}>Step {stepNumber}</div>
                <div className={`text-sm font-medium ${done || active ? 'text-[#142f04]' : 'text-[#6f8161]'}`}>{step}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-3xl border border-[#d9e7d0] bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold text-[#142f04]">Generate account</h2>
              <p className="mt-1 text-sm text-[#6f8161]">Set the profile shape first, then create a mailbox and credentials.</p>
            </div>
            <div className="space-y-4">
              <Field label="GEO">
                <select className="w-full rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-[#142f04]" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
                  {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Persona">
                <select className="w-full rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-[#142f04]" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
                  {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Document type">
                <select className="w-full rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-[#142f04]" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                  {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  <option value="missing_rule_probe">missing_rule_probe</option>
                </select>
              </Field>
              <Field label="Account role">
                <select className="w-full rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-[#142f04]" value={accountRole} onChange={(e) => setAccountRole(e.target.value as 'admin' | 'user')}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </Field>
              <button className="w-full rounded-2xl bg-[#55ce10] p-4 font-medium text-[#142f04] shadow-sm disabled:cursor-not-allowed disabled:opacity-60" onClick={generate} disabled={isGenerating}>
                {isGenerating ? 'Generating profile...' : 'Generate account'}
              </button>
              {isGenerating ? <div className="rounded-2xl border border-[#d9e7d0] bg-[#f7faf5] p-3 text-sm text-[#6f8161]">Creating mailbox, generating credentials, and checking the inbox. Please wait.</div> : null}
            </div>
          </section>

          <section className="rounded-3xl border border-[#d9e7d0] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-[#142f04]">History</h2>
                <p className="text-sm text-[#6f8161]">Reopen past test accounts when needed.</p>
              </div>
              <button type="button" className="rounded-xl border border-[#d9e7d0] px-3 py-2 text-xs text-[#355c18]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide' : 'Show'}</button>
            </div>
            {showHistory ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[#e5efe0] bg-[#fafcf9] p-4">
                    <div className="mb-2 text-sm font-medium text-[#142f04]">{item.geoLabel} • {item.documentType}</div>
                    <div className="text-sm text-[#355c18]">{item.email}</div>
                    <div className="mt-1 text-xs text-[#8aa07d]">{new Date(item.createdAt).toLocaleString()}</div>
                    <div className="mt-3 flex gap-2">
                      <button className="rounded-xl border border-[#d9e7d0] px-3 py-2 text-xs text-[#355c18]" onClick={() => loadDetail(item.id)}>Open</button>
                      <button className="rounded-xl border border-[#ead0cb] px-3 py-2 text-xs text-[#ad3725]" onClick={() => remove(item.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-[#e5efe0] bg-[#fafcf9] p-4 text-sm text-[#6f8161]">Recent generated accounts live here.</div>}
          </section>
        </aside>

        <section>
          {!detail ? (
            <div className="rounded-3xl border border-[#d9e7d0] bg-white p-12 shadow-sm">
              <div className="mx-auto max-w-xl text-center">
                <div className="mb-4 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Current account workspace</div>
                <h2 className="mb-3 text-3xl font-semibold text-[#142f04]">Generate an account to start the registration flow</h2>
                <p className="text-[#6f8161]">Once generated, this area becomes your working surface for credentials, mailbox refresh, codes, and confirmation links.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-3xl border border-[#d9e7d0] bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Current account workspace</div>
                    <h2 className="text-2xl font-semibold text-[#142f04]">Use these credentials on the registration form</h2>
                    <p className="mt-1 text-sm text-[#6f8161]">Only the fields needed for the main scenario are shown first.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-2xl border border-[#d9e7d0] px-4 py-3 text-sm text-[#355c18]" onClick={() => copyValue(`full-profile:${detail.id}`, detail.fullProfileText)}>{copiedField === `full-profile:${detail.id}` ? 'Copied full profile' : 'Copy Full Profile'}</button>
                    <a href={detail.registrationUrl} target="_blank" className="rounded-2xl bg-[#2993a3] px-4 py-3 text-sm font-medium text-white shadow-sm">Open registration</a>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <QuickValue label="Email" value={detail.email} />
                  <QuickValue label="Password" value={detail.emailPassword} hidden />
                  <QuickValue label="Username" value={detail.username} />
                  <QuickValue label="Phone" value={detail.phone} />
                  <QuickValue label="Document" value={`${detail.documentType} = ${detail.documentValue}`} />
                  <QuickValue label="Registration URL" value={detail.registrationUrl} />
                </div>

                <div className="mt-5">
                  <button type="button" className="rounded-2xl border border-[#d9e7d0] px-4 py-3 text-sm text-[#355c18]" onClick={() => setShowFullProfile((v) => !v)}>{showFullProfile ? 'Hide full profile' : 'Show full profile'}</button>
                </div>

                {showFullProfile ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <QuickValue label="First name" value={detail.firstName} />
                    <QuickValue label="Last name" value={detail.lastName} />
                    <QuickValue label="Gender" value={detail.gender} />
                    <QuickValue label="Date of Birth" value={detail.dateOfBirth} />
                    <QuickValue label="Age" value={String(detail.age)} />
                    <QuickValue label="Country" value={detail.country} />
                    <QuickValue label="City" value={detail.city} />
                    <QuickValue label="Address" value={detail.addressLine} />
                    <QuickValue label="Postal Code" value={detail.postalCode} />
                  </div>
                ) : null}
              </section>

              <section className="rounded-3xl border border-[#d9e7d0] bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Inbox verification</div>
                    <h2 className="text-2xl font-semibold text-[#142f04]">Refresh the mailbox and complete confirmation</h2>
                    <p className="mt-1 text-sm text-[#6f8161]">After signup, come back here to detect the email, extract the code, or open the verification link.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-2xl border border-[#d9e7d0] px-4 py-3 text-sm text-[#355c18]" onClick={() => refreshInboxForDetail(0)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Refreshing...' : 'Refresh Inbox'}</button>
                    <button type="button" className="rounded-2xl border border-[#d9e7d0] px-4 py-3 text-sm text-[#355c18]" onClick={() => refreshInboxForDetail(60000)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Waiting...' : 'Wait for Email (60s)'}</button>
                  </div>
                </div>

                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-4 py-2 text-sm font-medium ${detail.inbox.status === 'email_received' ? 'bg-[#f1faeb] text-[#355c18]' : 'bg-[#f2f5f0] text-[#6f8161]'}`}>{isRefreshingInbox ? 'Waiting for email' : inboxStatusLabel || (detail.inbox.status === 'email_received' ? 'Email received' : 'No email found')}</span>
                  {detail.inbox.subject ? <span className="text-sm text-[#355c18]">Subject: {detail.inbox.subject}</span> : null}
                  {detail.inbox.sender ? <span className="text-sm text-[#355c18]">Sender: {detail.inbox.sender}</span> : null}
                  {detail.inbox.receivedAt ? <span className="text-sm text-[#355c18]">Received: {new Date(detail.inbox.receivedAt).toLocaleString()}</span> : null}
                </div>

                {detail.inbox.primaryVerificationLink ? (
                  <div className="mb-6 rounded-3xl border border-[#bde3a5] bg-[#f1faeb] p-5">
                    <div className="mb-2 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Primary verification link</div>
                    <div className="mb-4 text-lg font-semibold text-[#142f04]">{detail.inbox.primaryVerificationLink.label || 'Verification link found'}</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-2xl bg-[#55ce10] px-4 py-3 text-sm font-medium text-[#142f04]" onClick={() => window.open(detail.inbox.primaryVerificationLink!.url, '_blank')}>Open Verification Link</button>
                      <button type="button" className="rounded-2xl border border-[#d9e7d0] px-4 py-3 text-sm text-[#355c18]" onClick={() => copyValue(`primary:${detail.inbox.primaryVerificationLink!.url}`, detail.inbox.primaryVerificationLink!.url)}>{copiedField === `primary:${detail.inbox.primaryVerificationLink!.url}` ? 'Copied' : 'Copy link'}</button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
                  <div className="rounded-2xl border border-[#e5efe0] bg-[#fafcf9] p-5">
                    <div className="mb-3 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Email text</div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-[#142f04]">{detail.inbox.plainText || 'No email yet. Register on the target site first, then use Refresh Inbox or Wait for Email.'}</div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[#e5efe0] bg-[#fafcf9] p-5">
                      <div className="mb-3 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Verification codes</div>
                      {detail.inbox.codes.length ? (
                        <div className="space-y-3">
                          {detail.inbox.codes.map((code) => (
                            <div key={code} className="flex items-center justify-between gap-2 rounded-2xl border border-white bg-white p-3 shadow-sm">
                              <span className="text-lg font-semibold tracking-wide text-[#142f04]">{code}</span>
                              <button type="button" className="rounded-xl border border-[#d9e7d0] px-3 py-2 text-xs text-[#355c18]" onClick={() => copyValue(`code:${code}`, code)}>{copiedField === `code:${code}` ? 'Copied' : 'Copy'}</button>
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-sm text-[#6f8161]">No verification codes found.</div>}
                    </div>
                  </div>
                </div>

                <details className="mt-6 rounded-2xl border border-[#e5efe0] bg-[#fafcf9] p-5" open={showDebug}>
                  <summary className="cursor-pointer text-sm font-medium text-[#355c18]" onClick={() => setShowDebug((v) => !v)}>Advanced / Debug</summary>
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="mb-3 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Links Found</div>
                      <div className="space-y-3">
                        {detail.inbox.links.length ? detail.inbox.links.map((link) => (
                          <div key={link.url} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                            <div className="mb-2 text-sm font-medium text-[#142f04]">{link.label || 'Link'}</div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="rounded-xl border border-[#d9e7d0] px-3 py-2 text-xs text-[#355c18]" onClick={() => window.open(link.url, '_blank')}>{link.isPrimary ? 'Open Verification Link' : 'Open Link'}</button>
                              <button type="button" className="rounded-xl border border-[#d9e7d0] px-3 py-2 text-xs text-[#355c18]" onClick={() => copyValue(`link:${link.url}`, link.url)}>{copiedField === `link:${link.url}` ? 'Copied' : 'Copy'}</button>
                              <button type="button" className="rounded-xl border border-[#d9e7d0] px-3 py-2 text-xs text-[#355c18]" onClick={() => setExpandedLink((current) => current === link.url ? '' : link.url)}>{expandedLink === link.url ? 'Hide URL' : 'Show URL'}</button>
                            </div>
                            {expandedLink === link.url ? <div className="mt-3 break-all text-xs text-[#6f8161]">{link.url}</div> : null}
                          </div>
                        )) : <div className="text-sm text-[#6f8161]">No links found yet.</div>}
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 text-sm font-medium uppercase tracking-wide text-[#6f8161]">Raw HTML</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-white bg-white p-4 text-xs text-[#6f8161] shadow-sm">{detail.inbox.rawHtml ?? 'No HTML message'}</pre>
                    </div>
                  </div>
                </details>
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#355c18]">{label}</label>
      {children}
    </div>
  );
}
