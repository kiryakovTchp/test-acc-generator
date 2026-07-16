'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, type PublicInvite, type UserInfo } from '@/lib/api';

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteLoading />}>
      <InviteForm />
    </Suspense>
  );
}

function InviteLoading() {
  return (
    <main className="login-shell invite-shell">
      <div className="login-card invite-card">
        <div className="login-badge">Workspace invite</div>
        <h1>Join Test User Console</h1>
        <p>Checking invite</p>
      </div>
    </main>
  );
}

function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('Checking invite');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('Invite token missing');
      setError('Invite link is missing a token.');
      return;
    }

    let cancelled = false;
    apiFetch<{ invite: PublicInvite }>(`/auth/invite?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (cancelled) return;
        setInvite(res.invite);
        setEmail(res.invite.email);
        setStatus('Invite ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('Invite unavailable');
        setError(err instanceof Error ? err.message : 'Invite is invalid or expired');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function acceptInvite(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('Invite token is missing.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setIsSubmitting(true);
    setStatus('Creating account');
    try {
      const res = await apiFetch<{ token: string; user: UserInfo }>('/auth/register', undefined, {
        method: 'POST',
        body: JSON.stringify({ inviteToken: token, email, username, password }),
      });
      window.localStorage.setItem('tag-user', JSON.stringify(res.user));
      router.push('/main');
    } catch (err) {
      setStatus('Invite ready');
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell invite-shell">
      <form className="login-card invite-card" onSubmit={acceptInvite}>
        <div className="login-badge">Workspace invite</div>
        <h1>Join Test User Console</h1>
        <p>{invite ? `${invite.workspaceName} · ${invite.role}` : status}</p>
        <div className="login-fields">
          <input className="input-field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" disabled={Boolean(invite?.email)} />
          <input className="input-field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" autoComplete="username" />
          <input className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" type="password" autoComplete="new-password" />
          <input className="input-field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="confirm password" type="password" autoComplete="new-password" />
        </div>
        {invite ? <p className="invite-meta">Expires {new Date(invite.expiresAt).toLocaleString()}</p> : null}
        {error ? <p className="alert alert-error">{error}</p> : null}
        <button className="primary-button w-full" disabled={!invite || isSubmitting}>
          {isSubmitting ? 'Creating account' : 'Accept invite'}
        </button>
      </form>
    </main>
  );
}
