# Product Backlog

Last updated: 2026-07-24

This file tracks product and engineering improvements that are not yet implemented. Keep it current when new requirements appear in chat or during implementation.

## Priority Legend

- `P0`: blocks safe operation;
- `P1`: important product capability or security/ops hardening;
- `P2`: useful improvement;
- `P3`: polish or optional enhancement.

## P1 - Personal Account Access ACL

Status: planned
Source: 2026-07-24 Telegram discussion after creating `i.kiryakov` in `Global PMO Africa`
Owner: Developer + Project

### Problem

The current sharing model uses `account_history.shared_with_workspace=1`, which opens an account to every member of the workspace. That is too broad for cases where an admin needs to give one specific user access to HasBalance accounts.

### Required Behavior

- Admins/owners can grant a specific user access to specific accounts without exposing those accounts to the whole workspace.
- Existing workspace-wide sharing remains available only as an explicit "share with workspace" action.
- `/history` and account detail visibility include direct account grants.
- Bulk grant flow supports "grant all admin-created HasBalance accounts in this workspace to this user".
- New HasBalance accounts should have a clear policy: manual grant by admin, or an explicit auto-grant rule for selected users.
- Activity log records grant/revoke events with actor, target user, account, and workspace.

### Recommended Technical Shape

- Add an `account_access` table with `account_id`, `user_id`, `granted_by_user_id`, `permission`, `created_at`, and optional `revoked_at`/soft-delete fields.
- Add indexes on `(user_id, account_id)` and `(account_id, user_id)`.
- Update account list/detail permission queries from creator/owner/workspace-share only to creator/owner/direct-grant/workspace-share.
- Add backend APIs for grant, revoke, and bulk grant by `balance_status='has_balance'`.
- Keep `shared_with_workspace` as a separate broad-sharing feature, not as the path for personal access.

## Completed on 2026-07-16

- Workspace archive/restore management for owners, including Settings UI and safe active-workspace fallback.
- Activity log table, API, and Settings -> Activity UI for generation, sharing, invite, member, workspace, and session events.
- Stronger frontend tests for shared UI state helpers and Settings tab metadata, replacing the smoke placeholder.
- Workspace creation policy setting: any active user or current workspace owner/admin only.
- Granular shared account permission setting for owner/admin balance and inbox refresh on shared accounts.
- Mailbox provider reliability pass: mail.tm/mail.gw provider selection, mail.tm -> mail.gw fallback mode, request timeout/retry, authenticated provider health check, and per-generation provider choice.
- P3 UI polish pass for the console: removed the dead `CMD K` control, calmed topbar metadata, kept Test Users as a table with contained horizontal overflow, added account table empty states, badge tooltips, and row-level saving feedback.

## Not Planned

- Dataset Quality Dashboard: explicitly deprioritized on 2026-07-16.

## P3 - UI Polish

Status: mostly complete

### Candidate Improvements

- continue visual refinement from real usage screenshots.

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
