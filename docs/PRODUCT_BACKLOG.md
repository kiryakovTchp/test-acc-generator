# Product Backlog

Last updated: 2026-07-16

This file tracks product and engineering improvements that are not yet implemented. Keep it current when new requirements appear in chat or during implementation.

## Priority Legend

- `P0`: blocks safe operation;
- `P1`: important product capability or security/ops hardening;
- `P2`: useful improvement;
- `P3`: polish or optional enhancement.

## Completed on 2026-07-16

- Workspace archive/restore management for owners, including Settings UI and safe active-workspace fallback.
- Activity log table, API, and Settings -> Activity UI for generation, sharing, invite, member, workspace, and session events.
- Stronger frontend tests for shared UI state helpers and Settings tab metadata, replacing the smoke placeholder.
- Workspace creation policy setting: any active user or current workspace owner/admin only.
- Granular shared account permission setting for owner/admin balance and inbox refresh on shared accounts.
- Mailbox provider reliability pass: mail.tm request timeout/retry and authenticated provider health check.

## Not Planned

- Dataset Quality Dashboard: explicitly deprioritized on 2026-07-16.

## P3 - UI Polish

Status: planned

### Candidate Improvements

- replace text placeholders like `CMD K` with real command menu or remove it;
- improve mobile table layout for Test Users;
- add row-level loading state for Share/Make private;
- add tooltips for scope badges and role badges;
- add empty-state copy for first workspace creation.

## P3 - Send Invite Emails

Status: low priority
Source: 2026-07-15 Telegram discussion; deprioritized on 2026-07-16
Owner: TBD

### Problem

Workspace invites currently produce a copyable invite link. Automated outbound invite email is a nice-to-have, not a near-term priority.

### Current Behavior

- Owner/admin opens Settings -> Invites.
- Owner/admin creates invite.
- Backend creates invite token and stores the token hash.
- Frontend shows an invite link for manual copy.
- No outbound email is sent.

### Required Behavior

- When prioritized later, owner/admin should be able to send invite email automatically.
- If email delivery fails, the invite should still exist and the copyable link should remain available.
- The resend path can be added later.

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

## P3 - Invite Email and Link Audit Fields

Status: low priority

### Problem

Invite status tracks token lifecycle but not email delivery attempts. This only matters when automated invite email becomes a priority.

### Candidate Fields

- `email_sent_at`;
- `email_send_status`;
- `email_send_error`;
- `last_email_attempt_at`;
- `email_attempt_count`.
