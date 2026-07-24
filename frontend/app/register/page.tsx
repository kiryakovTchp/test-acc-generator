'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');

  function openInvite(event: React.FormEvent) {
    event.preventDefault();
    const token = inviteToken.trim();
    if (!token) {
      setError('Invite token is required.');
      return;
    }
    router.push(`/invite?token=${encodeURIComponent(token)}`);
  }

  return (
    <main className="login-shell invite-shell">
      <form className="login-card invite-card" onSubmit={openInvite}>
        <div className="login-badge">Invite registration</div>
        <h1>Create account</h1>
        <p>Paste your workspace invite token to continue.</p>
        <div className="login-fields">
          <input
            className="input-field"
            id="invite-token"
            name="inviteToken"
            value={inviteToken}
            onChange={(event) => {
              setInviteToken(event.target.value);
              setError('');
            }}
            placeholder="invite token"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {error ? <p className="alert alert-error">{error}</p> : null}
        <button className="primary-button w-full">Continue</button>
        <a className="login-helper-link" href="/main">Back to sign in</a>
      </form>
    </main>
  );
}
