# Product Backlog

Last updated: 2026-07-15

This file tracks product and engineering improvements that are not yet implemented. Keep it current when new requirements appear in chat or during implementation.

## Priority Legend

- `P0`: blocks safe operation;
- `P1`: important product capability or security/ops hardening;
- `P2`: useful improvement;
- `P3`: polish or optional enhancement.

## P1 - Send Invite Emails

Status: planned  
Source: 2026-07-15 Telegram discussion  
Owner: TBD

### Problem

Workspace invites currently produce a copyable invite link. Operators want to create an invite for an email address and have the recipient receive an email automatically.

### Current Behavior

- Owner/admin opens Settings -> Invites.
- Owner/admin creates invite.
- Backend creates invite token and stores the token hash.
- Frontend shows an invite link for manual copy.
- No outbound email is sent.

### Required Behavior

- When an owner/admin creates an invite with an email address, backend should send an invite email.
- UI should clearly show whether the invite was sent.
- If email delivery fails, the invite should still exist and the copyable link should remain available.
- The resend path should be possible later, but initial implementation may only send on creation.

### Recommended Technical Shape

Add a small outbound mail abstraction:

```text
backend/src/mail/
  mailSender.ts          # interface
  smtpSender.ts          # SMTP implementation
  resendSender.ts        # optional API provider implementation
  inviteEmail.ts         # subject/text/html templates
```

Recommended providers:

- Resend;
- Postmark;
- SendGrid;
- Mailgun;
- SMTP only for a quick/self-hosted fallback.

Recommended env:

```text
INVITE_EMAIL_ENABLED=1
INVITE_EMAIL_PROVIDER=resend|smtp|postmark
INVITE_EMAIL_FROM="Test User Console <invites@example.com>"
INVITE_EMAIL_REPLY_TO=
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
```

Domain deliverability requirements:

- SPF;
- DKIM;
- DMARC;
- stable `MAIL_FROM`/sender domain.

Important note: `mail.tm` is only the temporary mailbox provider for generated identities. It should not be used for invite sending.

### Acceptance Criteria

- Settings -> Invites supports send-on-create when invite email is present.
- Backend test covers successful send.
- Backend test covers send failure while invite remains created.
- Frontend displays `sent`, `not sent`, or `send failed` state.
- Production env can disable sending safely.
- No provider secret is exposed to the frontend.

## P1 - Workspace Archive UI

Status: planned

### Problem

The database now has `workspaces.status` with `active` and `archived`, and access checks reject archived workspaces. There is no UI/API to archive or restore a workspace.

### Acceptance Criteria

- Owner can archive a workspace.
- Archived workspace disappears from switchable active workspaces or is clearly disabled.
- Owner can restore archived workspace from a management screen.
- Last active workspace protection exists so users are not stranded.

## P1 - Stronger Frontend Tests

Status: planned

### Problem

Frontend test is currently a smoke placeholder. Next build type checks the app, but important UI behavior is not covered.

### Candidate Coverage

- login/auth bootstrap;
- workspace switcher renders and changes active workspace;
- private/shared account controls render correctly;
- non-owner shared account rows are read-only;
- Settings tabs render without layout regressions;
- invite link copy and invite creation states.

## P1 - Invite Email and Link Audit Fields

Status: planned

### Problem

Invite status tracks token lifecycle but not email delivery attempts.

### Candidate Fields

- `email_sent_at`;
- `email_send_status`;
- `email_send_error`;
- `last_email_attempt_at`;
- `email_attempt_count`.

## P2 - Workspace Creation Policy

Status: planned

### Problem

Any active user can create a workspace today. That is probably fine for internal V1, but productized usage may need tighter policy.

### Options

- global admin only;
- workspace owner/admin only;
- allow active users, but cap workspace count;
- feature flag: `ALLOW_USER_WORKSPACE_CREATION`.

## P2 - Granular Shared Account Permissions

Status: planned

### Problem

Shared accounts are currently read-only for non-creators. Some team workflows may need shared editing for balance status or inbox refresh.

### Options

- keep current read-only model;
- allow `admin/owner` to edit shared accounts;
- add per-account permissions;
- allow workspace setting `sharedAccountsEditableByMembers`.

## P2 - Activity Log

Status: planned

### Problem

Important actions are not audited in a dedicated table.

### Candidate Events

- generated account;
- account shared/unshared;
- balance status changed;
- invite created/revoked/accepted;
- member role changed;
- workspace created/switched/archived;
- session revoked.

## P2 - Dataset Quality Dashboard

Status: planned

### Problem

Dataset quality exists per generated account, but operators do not have a full view of GEO/document coverage.

### Acceptance Criteria

- list GEOs and document types;
- show quality: verified, synthetic pattern, missing rules;
- show sample output;
- show notes/source confidence from docs.

## P2 - Email Provider Reliability

Status: planned

### Problem

Generated mailboxes depend on one provider.

### Candidate Improvements

- add provider fallback;
- provider health indicator;
- retry policy per provider;
- provider selection in workspace settings;
- better error codes for mailbox creation and inbox fetch failures.

## P3 - UI Polish

Status: planned

### Candidate Improvements

- replace text placeholders like `CMD K` with real command menu or remove it;
- improve mobile table layout for Test Users;
- add row-level loading state for Share/Make private;
- add tooltips for scope badges and role badges;
- add empty-state copy for first workspace creation.

