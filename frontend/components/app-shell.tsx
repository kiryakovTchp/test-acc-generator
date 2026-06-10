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
  'Open product registration',
  'Use profile fields',
  'Refresh or wait inbox',
  'Confirm by code or link',
];

function registrationStatusCopy(status: 'real' | 'placeholder') {
  if (status === 'placeholder') {
    return {
      badge: 'Placeholder registration URL',
      hint: 'This GEO is usable for local profile generation and inbox testing, but not for real sign-up. Replace the placeholder in backend/src/geo-rules.json before QA or production registration testing.',
      cta: 'Registration URL placeholder',
    };
  }

  return {
    badge: 'Real registration URL configured',
    hint: 'This GEO has a non-placeholder registration URL configured, so you can open the product registration page and continue sign-up testing.',
    cta: 'Open product registration',
  };
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

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
  const selectedGeoRegistrationMeta = currentGeo ? registrationStatusCopy(currentGeo.registrationUrlStatus) : null;
  const detailRegistrationMeta = detail ? registrationStatusCopy(detail.registrationUrlStatus) : null;
  const realRegistrationGeoCount = useMemo(() => geoItems.filter((item) => item.registrationUrlStatus === 'real').length, [geoItems]);
  const allRegistrationUrlsPlaceholder = geoItems.length > 0 && realRegistrationGeoCount === 0;

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

  async function loadDebugDetail(id: number) {
    const next = await apiFetch<Detail>(`/history/${id}?debug=1`, token);
    setDetail(next);
    setShowDebug(true);
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
      <div className="group rounded-[26px] border border-[rgba(20,47,4,0.08)] bg-white/95 p-4 shadow-[0_18px_48px_rgba(20,47,4,0.08)] transition-transform duration-200 hover:-translate-y-0.5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5b7d4f]">{label}</div>
        <div className="mb-4 break-all text-[15px] font-medium text-[#142f04]">{display}</div>
        <div className="flex gap-2">
          {hidden ? (
            <button type="button" className="rounded-full border border-[rgba(41,147,163,0.2)] px-3 py-2 text-xs font-medium text-[#1d7481]" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? 'Hide' : 'Reveal'}
            </button>
          ) : null}
          <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => copyValue(key, value)}>
            {copiedField === key ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
        <div className="panel-glow absolute left-[10%] top-[12%] h-48 w-48 rounded-full bg-[rgba(41,147,163,0.18)] blur-3xl" />
        <div className="panel-glow absolute bottom-[8%] right-[12%] h-56 w-56 rounded-full bg-[rgba(85,206,16,0.14)] blur-3xl" />
        <form className="surface-panel relative w-full max-w-md rounded-[34px] p-8" onSubmit={doLogin}>
          <div className="mb-8">
            <div className="eyebrow mb-3">QA account cockpit</div>
            <h1 className="display-title text-4xl text-[#142f04]">Test Account Generator</h1>
            <p className="mt-3 text-sm leading-6 text-[#5f7755]">Sign in to generate registration-ready identities, work mailbox checks, and finish verification flows from one place.</p>
          </div>
          <div className="space-y-4">
            <input className="input-field" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="login" />
            <input className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
          </div>
          {error ? <p className="mt-4 rounded-[22px] border border-[rgba(173,55,37,0.2)] bg-[rgba(173,55,37,0.08)] p-3 text-sm text-[#ad3725]">{error}</p> : null}
          <button className="primary-button mt-6 w-full">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="panel-glow absolute left-[-4rem] top-10 h-72 w-72 rounded-full bg-[rgba(41,147,163,0.14)] blur-3xl" />
      <div className="panel-glow absolute right-[-6rem] top-[30rem] h-80 w-80 rounded-full bg-[rgba(85,206,16,0.12)] blur-3xl" />
      <div className="mx-auto max-w-7xl">
        <header className="surface-panel mb-6 rounded-[36px] px-6 py-6 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="eyebrow mb-4">PMO / QA verification rig</div>
              <h1 className="display-title text-4xl text-[#142f04] sm:text-5xl">Registration flow, but operator-grade.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#5f7755]">Generate a usable profile, launch the real signup when available, then harvest codes or verification links without losing the thread.</p>
            </div>
            <div className="grid gap-3 sm:min-w-[280px]">
              <div className="rounded-[28px] border border-[rgba(20,47,4,0.08)] bg-white/80 px-5 py-4 text-sm text-[#4f6a43] shadow-[0_12px_28px_rgba(20,47,4,0.06)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6a8561]">Operator</div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[#142f04]">
                  <span className="font-medium">{user.login}</span>
                  <span className="rounded-full bg-[rgba(41,147,163,0.12)] px-3 py-1 text-xs font-semibold text-[#1d7481]">{user.role}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <details className="rounded-full border border-[rgba(20,47,4,0.08)] bg-white/80 px-4 py-3 text-xs text-[#5f7755] shadow-[0_12px_28px_rgba(20,47,4,0.06)]">
                  <summary className="cursor-pointer font-medium text-[#355c18]">Technical</summary>
                  <div className="mt-3 space-y-1 pr-4">
                    <div>User: {user.login}</div>
                    <div>Role: {user.role}</div>
                  </div>
                </details>
                <button className="rounded-full border border-[rgba(20,47,4,0.08)] bg-white/80 px-4 py-3 text-sm font-medium text-[#142f04] shadow-[0_12px_28px_rgba(20,47,4,0.06)]" onClick={() => { window.localStorage.clear(); setUser(null); setToken(''); }}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        {error ? <div className="mb-6 rounded-[24px] border border-[rgba(173,55,37,0.2)] bg-[rgba(173,55,37,0.08)] p-4 text-sm text-[#ad3725] shadow-[0_10px_24px_rgba(173,55,37,0.08)]">{error}</div> : null}

        <section className="surface-panel mb-6 rounded-[34px] p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow mb-2">Core flow</div>
              <h2 className="text-2xl font-semibold text-[#142f04]">Keep the signup thread visible at all times</h2>
            </div>
            <div className="rounded-full border border-[rgba(20,47,4,0.08)] bg-white/80 px-4 py-2 text-sm text-[#355c18]">
              Step <span className="font-semibold text-[#142f04]">{currentStep}</span> of {FLOW_STEPS.length}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            {FLOW_STEPS.map((step, index) => {
              const stepNumber = index + 1;
              const active = stepNumber === currentStep;
              const done = stepNumber < currentStep;
              return (
                <div
                  key={step}
                  className={cn(
                    'relative overflow-hidden rounded-[28px] border p-4 transition-all',
                    done && 'border-[rgba(85,206,16,0.25)] bg-[linear-gradient(135deg,rgba(85,206,16,0.18),rgba(255,255,255,0.88))]',
                    active && 'border-[rgba(41,147,163,0.28)] bg-[linear-gradient(135deg,rgba(41,147,163,0.16),rgba(255,255,255,0.92))] shadow-[0_18px_44px_rgba(41,147,163,0.12)]',
                    !done && !active && 'border-[rgba(20,47,4,0.08)] bg-white/70'
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold', done && 'bg-[#55ce10] text-[#142f04]', active && 'bg-[#2993A3] text-white', !done && !active && 'bg-[#eef2ea] text-[#6b8360]')}>
                      {stepNumber}
                    </span>
                    <span className={cn('text-[11px] font-semibold uppercase tracking-[0.24em]', done && 'text-[#355c18]', active && 'text-[#1d7481]', !done && !active && 'text-[#82987a]')}>
                      {done ? 'Done' : active ? 'Live' : 'Queued'}
                    </span>
                  </div>
                  <div className={cn('text-sm font-medium leading-6', done || active ? 'text-[#142f04]' : 'text-[#607757]')}>{step}</div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="surface-panel rounded-[34px] p-6">
              <div className="mb-6">
                <div className="eyebrow mb-2">Step 1</div>
                <h2 className="text-2xl font-semibold text-[#142f04]">Generate account</h2>
                <p className="mt-2 text-sm leading-6 text-[#5f7755]">Shape the persona first, then create mailbox credentials and the identity pack you’ll use during registration.</p>
              </div>
              {allRegistrationUrlsPlaceholder ? (
                <div className="mb-5 rounded-[24px] border border-[rgba(173,55,37,0.16)] bg-[linear-gradient(135deg,rgba(173,55,37,0.08),rgba(255,255,255,0.92))] p-4 text-sm text-[#ad3725]">
                  <div className="font-semibold">Local/dev ready, not real-signup ready</div>
                  <div className="mt-1">All configured GEO registration URLs are placeholders right now. You can still generate profiles and test mailbox behavior, but live signup launch stays intentionally blocked.</div>
                </div>
              ) : null}
              <div className="space-y-4">
                <Field label="GEO">
                  <select className="input-field" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
                    {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}{item.registrationUrlStatus === 'placeholder' ? ' · placeholder URL' : ''}</option>)}
                  </select>
                  {selectedGeoRegistrationMeta ? (
                    <div className={cn('mt-3 rounded-[22px] border p-3 text-sm leading-6', currentGeo?.registrationUrlStatus === 'placeholder' ? 'border-[rgba(173,55,37,0.16)] bg-[rgba(173,55,37,0.08)] text-[#ad3725]' : 'border-[rgba(85,206,16,0.18)] bg-[rgba(85,206,16,0.1)] text-[#355c18]')}>
                      <div className="font-semibold">{selectedGeoRegistrationMeta.badge}</div>
                      <div className="mt-1">{selectedGeoRegistrationMeta.hint}</div>
                    </div>
                  ) : null}
                </Field>
                <Field label="Persona">
                  <select className="input-field" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
                    {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Document type">
                  <select className="input-field" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                    {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                    <option value="missing_rule_probe">missing_rule_probe</option>
                  </select>
                </Field>
                <Field label="Account role">
                  <select className="input-field" value={accountRole} onChange={(e) => setAccountRole(e.target.value as 'admin' | 'user')}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </Field>
                <button className="primary-button w-full" onClick={generate} disabled={isGenerating}>
                  {isGenerating ? 'Generating profile...' : 'Generate account'}
                </button>
                {isGenerating ? <div className="rounded-[22px] border border-[rgba(41,147,163,0.14)] bg-[rgba(41,147,163,0.08)] p-3 text-sm text-[#4f6a43]">Creating mailbox, generating credentials, and checking the inbox. Please wait.</div> : null}
              </div>
            </section>

            <section className="surface-panel rounded-[34px] p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="eyebrow mb-2">Reopen work</div>
                  <h2 className="text-xl font-semibold text-[#142f04]">History</h2>
                  <p className="text-sm text-[#5f7755]">Pull an old generated account back into the workspace.</p>
                </div>
                <button type="button" className="rounded-full border border-[rgba(20,47,4,0.08)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? 'Hide' : 'Show'}
                </button>
              </div>
              {showHistory ? (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div key={item.id} className="rounded-[26px] border border-[rgba(20,47,4,0.08)] bg-white/75 p-4 shadow-[0_10px_24px_rgba(20,47,4,0.05)]">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-[#142f04]">{item.geoLabel}</div>
                        <span className="rounded-full bg-[rgba(41,147,163,0.1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d7481]">{item.documentType}</span>
                      </div>
                      <div className="break-all text-sm text-[#355c18]">{item.email}</div>
                      <div className="mt-2 text-xs text-[#7d9273]">{new Date(item.createdAt).toLocaleString()}</div>
                      <div className="mt-4 flex gap-2">
                        <button className="rounded-full border border-[rgba(20,47,4,0.1)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => loadDetail(item.id)}>Open</button>
                        <button className="rounded-full border border-[rgba(173,55,37,0.18)] px-3 py-2 text-xs font-medium text-[#ad3725]" onClick={() => remove(item.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-[24px] border border-[rgba(20,47,4,0.08)] bg-white/70 p-4 text-sm text-[#5f7755]">Recent generated accounts live here.</div>}
            </section>
          </aside>

          <section>
            {!detail ? (
              <div className="surface-panel rounded-[36px] p-8 sm:p-12">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                  <div>
                    <div className="eyebrow mb-3">Current account workspace</div>
                    <h2 className="display-title text-3xl text-[#142f04] sm:text-4xl">Generate an account and the operator console comes alive.</h2>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-[#5f7755]">This is where credentials, profile fields, mailbox refresh, verification codes, and direct confirmation links will line up in one working surface.</p>
                  </div>
                  <div className="grid gap-3">
                    {['Generate account', 'Open real signup or inspect readiness', 'Copy fields', 'Refresh inbox', 'Confirm via code or link'].map((item, index) => (
                      <div key={item} className="rounded-[24px] border border-[rgba(20,47,4,0.08)] bg-white/80 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7b9271]">0{index + 1}</div>
                        <div className="mt-2 text-sm font-medium text-[#142f04]">{item}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <section className="surface-panel rounded-[36px] p-6 sm:p-8">
                  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <div className="eyebrow mb-2">Current account workspace</div>
                      <h2 className="text-2xl font-semibold text-[#142f04]">Use these details on the registration form</h2>
                      <p className="mt-2 text-sm leading-6 text-[#5f7755]">Everything needed for registration is grouped below for fast copy/paste, without losing visibility on live signup readiness.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-4 py-3 text-sm font-medium text-[#355c18]" onClick={() => copyValue(`full-profile:${detail.id}`, detail.fullProfileText)}>{copiedField === `full-profile:${detail.id}` ? 'Copied full profile' : 'Copy Full Profile'}</button>
                      {detail.registrationUrlStatus === 'real' ? (
                        <a href={detail.registrationUrl} target="_blank" rel="noreferrer" className="rounded-full bg-[#2993a3] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(41,147,163,0.2)]">{detailRegistrationMeta?.cta ?? 'Open product registration'}</a>
                      ) : (
                        <button type="button" disabled className="rounded-full bg-[#b8c3b0] px-5 py-3 text-sm font-semibold text-white">{detailRegistrationMeta?.cta ?? 'Registration URL placeholder'}</button>
                      )}
                    </div>
                  </div>

                  {detailRegistrationMeta ? (
                    <div className={cn('mb-6 rounded-[26px] border p-4 text-sm leading-6', detail.registrationUrlStatus === 'placeholder' ? 'border-[rgba(173,55,37,0.16)] bg-[rgba(173,55,37,0.08)] text-[#ad3725]' : 'border-[rgba(85,206,16,0.2)] bg-[rgba(85,206,16,0.1)] text-[#355c18]')}>
                      <div className="font-semibold">{detailRegistrationMeta.badge}</div>
                      <div className="mt-1">{detailRegistrationMeta.hint}</div>
                    </div>
                  ) : null}

                  <div className="mb-6 grid gap-4 lg:grid-cols-3">
                    <StatTile label="GEO" value={detail.geoLabel} tone="accent" />
                    <StatTile label="Persona" value={detail.persona.replaceAll('_', ' ')} tone="neutral" />
                    <StatTile label="Document quality" value={detail.documentQuality.replaceAll('_', ' ')} tone={detail.documentQuality === 'verified' ? 'success' : detail.documentQuality === 'missing_rules' ? 'danger' : 'neutral'} />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <DetailGroup title="Account access" description="Use these credentials for the mailbox and registration flow.">
                      <QuickValue label="Email" value={detail.email} />
                      <QuickValue label="Mailbox password" value={detail.emailPassword} hidden />
                      <QuickValue label="Phone" value={detail.phone} />
                      <QuickValue label="Role" value={detail.role} />
                    </DetailGroup>

                    <DetailGroup title="Personal info" description="Basic identity details for profile creation.">
                      <QuickValue label="First name" value={detail.firstName} />
                      <QuickValue label="Last name" value={detail.lastName} />
                      <QuickValue label="Gender" value={detail.gender} />
                      <QuickValue label="Date of Birth" value={detail.dateOfBirth} />
                      <QuickValue label="Age" value={String(detail.age)} />
                    </DetailGroup>

                    <DetailGroup title="Address" description="Location fields commonly requested on the registration form.">
                      <QuickValue label="Country" value={detail.country} />
                      <QuickValue label="Region" value={detail.region} />
                      <QuickValue label="City" value={detail.city} />
                      <QuickValue label="Place of Birth" value={detail.placeOfBirth} />
                      <QuickValue label="Address" value={detail.addressLine} />
                      <QuickValue label="Postal Code" value={detail.postalCode} />
                    </DetailGroup>

                    <DetailGroup title="Identity" description="Document values used during verification.">
                      <QuickValue label="Document Type" value={detail.documentType} />
                      <QuickValue label="Document Value" value={detail.documentValue} />
                      <QuickValue label="Document Issue Date" value={detail.documentIssueDate} />
                      <QuickValue label="Document Quality" value={detail.documentQuality} />
                      <QuickValue label="Geo" value={detail.geoLabel} />
                    </DetailGroup>

                    <DetailGroup title="Reference" description="Secondary values for operators, not primary registration fields.">
                      <QuickValue label="Username" value={detail.username} />
                      <QuickValue label="Registration URL" value={detail.registrationUrl} />
                      <QuickValue label="Registration URL Status" value={detail.registrationUrlStatus} />
                      <QuickValue label="Persona" value={detail.persona} />
                    </DetailGroup>
                  </div>

                  <div className="mt-5">
                    <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-4 py-3 text-sm font-medium text-[#355c18]" onClick={() => setShowFullProfile((v) => !v)}>{showFullProfile ? 'Hide raw full profile' : 'Show raw full profile'}</button>
                  </div>

                  {showFullProfile ? (
                    <div className="mt-5 rounded-[28px] border border-[rgba(20,47,4,0.08)] bg-white/75 p-5">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f8666]">Full profile text</div>
                      <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-[#142f04]">{detail.fullProfileText}</pre>
                    </div>
                  ) : null}
                </section>

                <section className="surface-panel rounded-[36px] p-6 sm:p-8">
                  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <div className="eyebrow mb-2">Inbox verification</div>
                      <h2 className="text-2xl font-semibold text-[#142f04]">Refresh the mailbox and complete confirmation</h2>
                      <p className="mt-2 text-sm leading-6 text-[#5f7755]">After signup, return here to detect the message, extract codes, and open the primary verification link fast.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-4 py-3 text-sm font-medium text-[#355c18]" onClick={() => refreshInboxForDetail(0)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Refreshing...' : 'Refresh Inbox'}</button>
                      <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-4 py-3 text-sm font-medium text-[#355c18]" onClick={() => refreshInboxForDetail(60000)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Waiting...' : 'Wait for Email (60s)'}</button>
                    </div>
                  </div>

                  <div className="mb-6 grid gap-3 lg:grid-cols-[auto_auto_auto_1fr]">
                    <span className={cn('w-fit rounded-full px-4 py-2 text-sm font-semibold', detail.inbox.status === 'email_received' ? 'bg-[rgba(85,206,16,0.16)] text-[#355c18]' : 'bg-[rgba(20,47,4,0.06)] text-[#607757]')}>
                      {isRefreshingInbox ? 'Waiting for email' : inboxStatusLabel || (detail.inbox.status === 'email_received' ? 'Email received' : 'No email found')}
                    </span>
                    {detail.inbox.subject ? <span className="rounded-full bg-white/80 px-4 py-2 text-sm text-[#355c18]"><span className="font-semibold">Subject:</span> {detail.inbox.subject}</span> : null}
                    {detail.inbox.sender ? <span className="rounded-full bg-white/80 px-4 py-2 text-sm text-[#355c18]"><span className="font-semibold">Sender:</span> {detail.inbox.sender}</span> : null}
                    {detail.inbox.receivedAt ? <span className="rounded-full bg-white/80 px-4 py-2 text-sm text-[#355c18]"><span className="font-semibold">Received:</span> {new Date(detail.inbox.receivedAt).toLocaleString()}</span> : null}
                  </div>

                  {detail.inbox.primaryVerificationLink ? (
                    <div className="mb-6 rounded-[30px] border border-[rgba(85,206,16,0.24)] bg-[linear-gradient(135deg,rgba(85,206,16,0.18),rgba(255,255,255,0.92))] p-5 shadow-[0_16px_36px_rgba(85,206,16,0.12)]">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5c7e4f]">Primary verification link</div>
                      <div className="mb-4 break-all text-lg font-semibold text-[#142f04]">{detail.inbox.primaryVerificationLink.label || 'Verification link found'}</div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="primary-button" onClick={() => window.open(detail.inbox.primaryVerificationLink!.url, '_blank')}>Open Verification Link</button>
                        <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-4 py-3 text-sm font-medium text-[#355c18]" onClick={() => copyValue(`primary:${detail.inbox.primaryVerificationLink!.url}`, detail.inbox.primaryVerificationLink!.url)}>{copiedField === `primary:${detail.inbox.primaryVerificationLink!.url}` ? 'Copied' : 'Copy link'}</button>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
                    <div className="rounded-[28px] border border-[rgba(20,47,4,0.08)] bg-white/75 p-5">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f8666]">Email text</div>
                      <div className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-[#142f04]">{detail.inbox.plainText || 'No email yet. Register on the target site first, then use Refresh Inbox or Wait for Email.'}</div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[28px] border border-[rgba(20,47,4,0.08)] bg-white/75 p-5">
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f8666]">Verification codes</div>
                        {detail.inbox.codes.length ? (
                          <div className="space-y-3">
                            {detail.inbox.codes.map((code) => (
                              <div key={code} className="flex items-center justify-between gap-2 rounded-[22px] border border-[rgba(20,47,4,0.06)] bg-white p-3 shadow-[0_10px_22px_rgba(20,47,4,0.06)]">
                                <span className="text-lg font-semibold tracking-[0.18em] text-[#142f04]">{code}</span>
                                <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => copyValue(`code:${code}`, code)}>{copiedField === `code:${code}` ? 'Copied' : 'Copy'}</button>
                              </div>
                            ))}
                          </div>
                        ) : <div className="text-sm text-[#5f7755]">No verification codes found.</div>}
                      </div>
                    </div>
                  </div>

                  <details className="mt-6 rounded-[28px] border border-[rgba(20,47,4,0.08)] bg-white/70 p-5" open={showDebug}>
                    <summary className="cursor-pointer text-sm font-semibold text-[#355c18]" onClick={() => {
                      const next = !showDebug;
                      setShowDebug(next);
                      if (next && detail && !detail.inbox.rawHtml) {
                        void loadDebugDetail(detail.id);
                      }
                    }}>Advanced / Debug</summary>
                    <div className="mt-5 space-y-5">
                      <div>
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f8666]">Links Found</div>
                        <div className="space-y-3">
                          {detail.inbox.links.length ? detail.inbox.links.map((link) => (
                            <div key={link.url} className="rounded-[24px] border border-[rgba(20,47,4,0.08)] bg-white p-4 shadow-[0_10px_22px_rgba(20,47,4,0.05)]">
                              <div className="mb-2 break-all text-sm font-semibold text-[#142f04]">{link.label || 'Link'}</div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => window.open(link.url, '_blank')}>{link.isPrimary ? 'Open Verification Link' : 'Open Link'}</button>
                                <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => copyValue(`link:${link.url}`, link.url)}>{copiedField === `link:${link.url}` ? 'Copied' : 'Copy'}</button>
                                <button type="button" className="rounded-full border border-[rgba(20,47,4,0.1)] px-3 py-2 text-xs font-medium text-[#355c18]" onClick={() => setExpandedLink((current) => current === link.url ? '' : link.url)}>{expandedLink === link.url ? 'Hide URL' : 'Show URL'}</button>
                              </div>
                              {expandedLink === link.url ? <div className="mt-3 break-all text-xs text-[#6f8161]">{link.url}</div> : null}
                            </div>
                          )) : <div className="text-sm text-[#5f7755]">No links found yet.</div>}
                        </div>
                      </div>

                      <div>
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f8666]">Raw HTML</div>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[24px] border border-[rgba(20,47,4,0.08)] bg-white p-4 text-xs text-[#6f8161]">{detail.inbox.rawHtml ?? 'No HTML message loaded. Expand debug to fetch it.'}</pre>
                      </div>
                    </div>
                  </details>
                </section>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[#355c18]">{label}</label>
      {children}
    </div>
  );
}

function DetailGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-[rgba(20,47,4,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,250,243,0.88))] p-5 shadow-[0_16px_36px_rgba(20,47,4,0.06)]">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6f8666]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-[#5f7755]">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'success' | 'danger' | 'neutral' }) {
  const tones = {
    accent: 'border-[rgba(41,147,163,0.18)] bg-[rgba(41,147,163,0.08)] text-[#1d7481]',
    success: 'border-[rgba(85,206,16,0.2)] bg-[rgba(85,206,16,0.1)] text-[#355c18]',
    danger: 'border-[rgba(173,55,37,0.16)] bg-[rgba(173,55,37,0.08)] text-[#ad3725]',
    neutral: 'border-[rgba(20,47,4,0.08)] bg-white/75 text-[#4f6a43]',
  } as const;

  return (
    <div className={cn('rounded-[24px] border p-4 shadow-[0_10px_24px_rgba(20,47,4,0.05)]', tones[tone])}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-80">{label}</div>
      <div className="mt-2 text-base font-semibold capitalize text-[#142f04]">{value}</div>
    </div>
  );
}
