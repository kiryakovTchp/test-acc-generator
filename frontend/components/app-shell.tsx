'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch, type GeoItem, type HistoryItem, type UserInfo } from '@/lib/api';

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
  inbox: { status: 'waiting_for_email' | 'email_received' | 'no_email_found'; sender: string; subject: string; receivedAt: string; plainText: string; links: string[]; codes: string[]; rawHtml?: string | null };
  createdAt: string;
}

const PERSONAS: Array<{ value: PersonaKey; label: string }> = [
  { value: 'standard_user', label: 'Standard User: 25–40' },
  { value: 'young_user', label: 'Young User: 18–24' },
  { value: 'senior_user', label: 'Senior User: 55+' },
  { value: 'male_user', label: 'Male User' },
  { value: 'female_user', label: 'Female User' },
];

const E2E_CHECKLIST = [
  'generate profile',
  'open registration',
  'submit form',
  'refresh inbox',
  'verify email received',
  'verify code/link extracted',
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
  const [showHtml, setShowHtml] = useState(false);
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

  function CopyRow({ label, value, hidden = false }: { label: string; value: string; hidden?: boolean }) {
    const display = hidden && !showPassword ? '••••••••••••' : value;
    const key = `${label}:${value}`;
    return (
      <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
        <strong>{label}:</strong>
        <button type="button" className="text-left break-all rounded border border-slate-800 bg-slate-900 px-3 py-2 hover:border-slate-600" onClick={() => copyValue(key, value)} title="Copy value">
          {display}
        </button>
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
            <p className="mt-2 text-sm text-slate-400">Sign in with your assigned credentials. Passwords you generate are never shown in lists.</p>
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
          <p className="text-sm text-slate-400">API: {API_URL} • {user.login} ({user.role})</p>
        </div>
        <button className="rounded-lg border border-slate-700 px-4 py-2" onClick={() => { window.localStorage.clear(); setUser(null); setToken(''); }}>Logout</button>
      </div>

      {error ? <p className="mb-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-rose-200">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr_460px]">
        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Generate</h2>
          <label className="block text-sm text-slate-300">GEO</label>
          <select className="w-full rounded-lg bg-slate-950 p-3" value={selectedGeo} onChange={(e) => setSelectedGeo(e.target.value)}>
            {geoItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>

          <label className="block text-sm text-slate-300">Persona</label>
          <select className="w-full rounded-lg bg-slate-950 p-3" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
            {PERSONAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>

          <label className="block text-sm text-slate-300">Document type</label>
          <select className="w-full rounded-lg bg-slate-950 p-3" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {(currentGeo?.documentTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="missing_rule_probe">missing_rule_probe</option>
          </select>

          <label className="block text-sm text-slate-300">Account role</label>
          <select className="w-full rounded-lg bg-slate-950 p-3" value={accountRole} onChange={(e) => setAccountRole(e.target.value as 'admin' | 'user')}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span>Registration URL</span>
              <span className={`rounded-full px-2 py-1 text-xs ${currentGeo?.registrationUrlStatus === 'real' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}>
                {currentGeo?.registrationUrlStatus === 'real' ? 'Real URL' : 'Placeholder URL'}
              </span>
            </div>
            <a href={currentGeo?.registrationUrl} target="_blank" className="break-all text-sky-300">{currentGeo?.registrationUrl}</a>
          </div>

          <button className="w-full rounded-lg bg-emerald-600 p-3 font-medium" onClick={generate}>Generate account</button>
        </section>

        <section className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">History</h2>
              <span className="text-sm text-slate-400">last 50 only</span>
            </div>
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.geoLabel} • {item.documentType}</p>
                      <p className="text-sm text-slate-400">{item.firstName} {item.lastName} • {item.email}</p>
                      <p className="text-xs text-slate-500">{item.username} • {item.phone} • {item.documentQuality} • {new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-lg border border-slate-700 px-3 py-1 text-sm" onClick={() => loadDetail(item.id)}>View</button>
                      <button className="rounded-lg border border-rose-800 px-3 py-1 text-sm text-rose-300" onClick={() => remove(item.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <h3 className="mb-3 text-lg font-semibold">E2E checklist</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              {E2E_CHECKLIST.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-xl font-semibold">Detail</h2>
          {!detail ? <p className="text-sm text-slate-400">Generate or open a history row.</p> : (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 rounded-xl bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${detail.registrationUrlStatus === 'real' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}>
                    {detail.registrationUrlStatus === 'real' ? 'Real URL' : 'Placeholder URL'}
                  </span>
                  <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(`full-profile:${detail.id}`, detail.fullProfileText)}>{copiedField === `full-profile:${detail.id}` ? 'Copied full profile' : 'Copy Full Profile'}</button>
                </div>
                <CopyRow label="First name" value={detail.firstName} />
                <CopyRow label="Last name" value={detail.lastName} />
                <CopyRow label="Gender" value={detail.gender} />
                <CopyRow label="Date of Birth" value={detail.dateOfBirth} />
                <CopyRow label="Age" value={String(detail.age)} />
                <CopyRow label="Country" value={detail.country} />
                <CopyRow label="City" value={detail.city} />
                <CopyRow label="Address" value={detail.addressLine} />
                <CopyRow label="Postal Code" value={detail.postalCode} />
                <CopyRow label="Phone" value={detail.phone} />
                <CopyRow label="Email" value={detail.email} />
                <CopyRow label="Password" value={detail.emailPassword} hidden />
                <CopyRow label="Username" value={detail.username} />
                <CopyRow label="Document" value={`${detail.documentType} = ${detail.documentValue}`} />
                <CopyRow label="Persona" value={detail.persona} />
                <div className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-center">
                  <strong>Role:</strong>
                  <span>{detail.role}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-center">
                  <strong>Quality:</strong>
                  <span>{detail.documentQuality}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
                  <strong>Registration:</strong>
                  <a href={detail.registrationUrl} target="_blank" className="break-all text-sky-300 hover:text-sky-200">{detail.registrationUrl}</a>
                  <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(`registration:${detail.registrationUrl}`, detail.registrationUrl)}>{copiedField === `registration:${detail.registrationUrl}` ? 'Copied' : 'Copy'}</button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Inbox plain text</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded border border-slate-700 px-3 py-1 text-xs" onClick={() => refreshInboxForDetail(0)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Refreshing...' : 'Refresh Inbox'}</button>
                    <button type="button" className="rounded border border-slate-700 px-3 py-1 text-xs" onClick={() => refreshInboxForDetail(60000)} disabled={isRefreshingInbox}>{isRefreshingInbox ? 'Waiting...' : 'Wait for Email (60s)'}</button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 ${detail.inbox.status === 'email_received' ? 'bg-emerald-900/50 text-emerald-300' : detail.inbox.status === 'waiting_for_email' ? 'bg-sky-900/50 text-sky-300' : 'bg-slate-800 text-slate-300'}`}>{isRefreshingInbox ? 'Waiting for email' : inboxStatusLabel || (detail.inbox.status === 'email_received' ? 'Email received' : 'No email found')}</span>
                  {detail.inbox.sender ? <span>From: {detail.inbox.sender}</span> : null}
                  {detail.inbox.subject ? <span>Subject: {detail.inbox.subject}</span> : null}
                  {detail.inbox.receivedAt ? <span>Received: {new Date(detail.inbox.receivedAt).toLocaleString()}</span> : null}
                </div>
                <button type="button" className="w-full text-left whitespace-pre-wrap text-slate-300" onClick={() => copyValue(`inbox:${detail.id}`, detail.inbox.plainText || '')}>
                  {detail.inbox.plainText || 'No messages yet'}
                </button>
                {detail.inbox.plainText ? <div className="mt-2 text-xs text-slate-500">Tap the text to copy it.</div> : <div className="mt-2 text-xs text-slate-500">No message received yet. Use Refresh Inbox or Wait for Email after registering on the target site.</div>}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-slate-950 p-4">
                  <p className="mb-2 font-medium">Extracted links</p>
                  <ul className="space-y-2">{detail.inbox.links.map((link) => <li key={link} className="flex items-start gap-2"><a href={link} target="_blank" className="break-all">{link}</a><button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => window.open(link, '_blank')}>Open Link</button><button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(`link:${link}`, link)}>{copiedField === `link:${link}` ? 'Copied' : 'Copy'}</button></li>)}</ul>
                </div>
                <div className="rounded-xl bg-slate-950 p-4">
                  <p className="mb-2 font-medium">Extracted codes</p>
                  <ul className="space-y-2">{detail.inbox.codes.map((code) => <li key={code} className="flex items-center justify-between gap-2"><span>{code}</span><button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs" onClick={() => copyValue(`code:${code}`, code)}>{copiedField === `code:${code}` ? 'Copied' : 'Copy'}</button></li>)}</ul>
                </div>
              </div>

              <details className="rounded-xl bg-slate-950 p-4" open={showHtml}>
                <summary className="cursor-pointer font-medium" onClick={() => setShowHtml((v) => !v)}>Debug raw HTML</summary>
                <pre className="mt-3 whitespace-pre-wrap text-slate-400">{detail.inbox.rawHtml ?? 'No HTML message'}</pre>
              </details>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
