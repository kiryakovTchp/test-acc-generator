# Test Account Generator V1 - current state

Last updated: 2026-07-16
Production URL: https://test-acc-generator.touchpe.ru
Current production commit at update time: this document's commit

This document describes the current product and technical state. The older roadmap files in this folder are historical planning notes unless they explicitly say otherwise.

## Product Purpose

Test Account Generator V1 is an internal QA console for generating test users and using them in manual registration or verification flows on external sites.

The app does not register users on target sites by itself. It creates realistic test identity data, temporary mailbox credentials, and a workspace where operators can copy fields, inspect inbox messages, collect verification links/codes, and track account state.

Primary user jobs:

- generate a single test identity or a batch of identities;
- copy registration fields quickly;
- inspect the generated mailbox;
- extract email verification links and numeric codes;
- track site account id and balance status manually;
- keep generated accounts private by default;
- share selected generated accounts with teammates in the same workspace;
- invite teammates into workspaces with role-based access;
- review workspace activity across generation, sharing, invites, members, workspaces, and sessions.

## Stack

Runtime:

- frontend: Next.js 15, React 19, TypeScript;
- backend: Node.js, Express 5, TypeScript;
- database: SQLite through `better-sqlite3`;
- auth: password hashes with Node `scrypt`, session table, JWT access tokens;
- mailbox provider: `mail.tm` through the `EmailProvider` interface;
- deployment: Dockerfile, docker-compose, nginx reverse proxy.

Repo structure:

```text
test-account-generator-v1/
  backend/
    src/
      index.ts                         # Express API routes
      db.ts                            # SQLite schema, migrations, seed/bootstrap users
      auth.ts                          # password/session token hashing helpers
      permissions.ts                   # workspace role checks
      workspaces.ts                    # workspace list/create/switch helpers
      workspaceMembers.ts              # member management
      invitations.ts                   # invite token lifecycle and invite registration
      activity.ts                      # workspace activity log
      settings.ts                      # user/workspace settings
      limits.ts                        # usage limits and usage events
      monitoring.ts                    # alerts and analytics summary
      services/accountService.ts       # identity generation, history, sharing, inbox updates
      providers/emailProvider.ts       # provider interface
      providers/mailTmProvider.ts      # mail.tm provider
      geo-rules.json                   # GEO/document rules
      utils.ts                         # profile generation, links, codes, text cleanup
  frontend/
    app/
      main/page.tsx
      accounts/page.tsx
      mailboxes/page.tsx
      codes/page.tsx
      settings/page.tsx
      register/page.tsx
      invite/page.tsx
      globals.css
    components/app-shell.tsx           # main UI shell and all console views
    lib/api.ts                         # frontend API client and response types
  docs/
  Dockerfile
  docker-compose.yml
  README.md
```

## Runtime Architecture

Production flow:

```text
Browser
  -> nginx
    -> /        Next.js frontend on 127.0.0.1:3000
    -> /api/*   Express backend on 127.0.0.1:4000
        -> SQLite database mounted at backend/data/app.db
        -> mail.tm API for temporary mailboxes
```

Frontend calls `/api` by default. In local development, `frontend/next.config.ts` rewrites `/api/*` to the backend. In production, nginx performs the routing.

## Core Concepts

### User

A service user can log in, have personal settings, have active sessions, and belong to one or more workspaces.

Important fields:

- `users.login`;
- `users.email`;
- `users.username`;
- `users.password_hash`;
- `users.role`: global app role, currently `admin` or `user`;
- `users.status`: currently `active` is required for auth and workspace creation.

Passwords are stored as hashes. Legacy plaintext `users.password` is migrated into `password_hash` and then cleared.

### Workspace

A workspace is the team/context boundary for:

- members;
- invites;
- limits and settings;
- usage events;
- generated account ownership and sharing.

Important fields:

- `workspaces.owner_user_id`;
- `workspaces.name`;
- `workspaces.status`: `active` or `archived`.

New workspaces are created as `active`. The backend already checks active status for access and switching.

### Workspace Member

Membership lives in `workspace_members` and has a workspace role:

- `owner`;
- `admin`;
- `member`;
- `viewer`.

Role summary:

| Action | owner | admin | member | viewer |
| --- | --- | --- | --- | --- |
| Read workspace settings | yes | yes | yes | yes |
| Read own generated accounts | yes | yes | yes | yes |
| Read shared workspace accounts | yes | yes | yes | yes |
| Generate accounts | yes | yes | yes | no |
| Create temporary mailbox | yes | yes | yes | no |
| Refresh inbox for own account | yes | yes | yes | no |
| Change own account id / balance / phone | yes | yes | yes | no |
| Share/unshare own account | yes | yes | yes | no |
| Change balance / refresh inbox for shared accounts when enabled | yes | yes | no | no |
| Manage workspace settings | yes | yes | no | no |
| Manage members | yes | yes | no | no |
| Manage invites | yes | yes | no | no |

Note: a shared generated account is read-only for non-creators by default. When `workspace_settings.shared_account_editing` is `owner_admin`, workspace owners/admins can change balance status and refresh inbox for shared accounts. Account id, phone, delete, and share/unshare remain creator-only.

### Generated Account

Generated account rows live in `account_history`.

Important ownership fields:

- `workspace_id`: workspace where the account was created;
- `created_by_user_id`: creator;
- `shared_with_workspace`: `0` by default, `1` when explicitly shared;
- `shared_at`: set when the account is shared.

Visibility rule:

```text
The current user can see a generated account when:
  row.workspace_id == active workspace
  and (
    row.created_by_user_id == current user
    or row.user_id == current user for legacy rows
    or row.shared_with_workspace == 1
  )
```

New generated accounts are private by default. The creator can share or make private again from the UI.

### Workspace Settings

Workspace settings include:

- retention and history limits;
- bulk generation limits;
- usage quotas;
- mailbox provider selection;
- `shared_account_editing`: `creator_only` or `owner_admin`;
- `workspace_creation_policy`: `active_users` or `owner_admin`.

When workspace creation policy is `owner_admin`, only the current workspace owner/admin can create another workspace from that context.

### Invite

Invites live in `workspace_invites`.

Current behavior:

- owner/admin can create invite links;
- invite can be tied to an email or be open;
- invite roles can be `admin`, `member`, or `viewer`;
- invite tokens are stored hashed;
- invite acceptance registers a new user into the invited workspace;
- accepted/revoked/expired status is tracked.

Current limitation:

- invite links are not emailed automatically yet. The UI provides a copyable invite link.

### Activity Event

Activity events live in `activity_events` and are scoped to a workspace.

Current logged actions:

- generated account;
- account shared/unshared;
- balance status changed;
- invite created/revoked/accepted;
- member added/removed/role changed;
- workspace created/archived/restored;
- session revoked, logout everywhere, and password change.

Activity can be read by any active member of the current workspace and appears in Settings -> Activity.

Storage guard:

- activity is capped at the latest 5000 events per workspace;
- events older than 180 days are removed during activity writes.

## Frontend Views

### `/main`

Primary operator workspace:

- generation settings;
- quick actions;
- usage strip;
- recent identities;
- selected identity details;
- registration data;
- inbox snapshot;
- verification link/code extraction.

Recent identities show compact status and privacy scope. The selected identity has a workspace sharing control.

### `/accounts`

Full generated account table:

- search;
- status filter;
- balance filter;
- GEO filter;
- sort;
- status badge;
- balance select badge;
- `Private` / `Shared` scope badge;
- creator-only Share / Make private action;
- details modal.

### `/mailboxes`

Inbox-focused view:

- create standalone temporary mailbox;
- open generated mailbox;
- refresh/wait for inbox;
- inspect latest message;
- copy email body, links, and codes.

### `/codes`

Verification-focused view:

- latest verification codes from selected generated account;
- verification links from latest inbox message;
- compact history table for opening an account.

### `/settings`

Settings are grouped by tabs:

- Defaults: personal generation defaults;
- Workspace: limits, retention, provider, create workspace;
- Invites: create/revoke invite links;
- Team: member list and role management;
- Security: profile, password, sessions;
- Analytics: workspace usage and alerts;
- Activity: recent workspace action log.

Workspace switcher is in the sidebar. Creating a workspace immediately switches the session into the new workspace by issuing a new JWT with that workspace id.

### `/register`

Invite-token entry page. The user pastes an invite token and is redirected into the invite acceptance flow.

### `/invite`

Invite acceptance page. It inspects the invite token publicly, then registers the user into that workspace when valid.

## Backend API Summary

All private routes require:

```http
Authorization: Bearer <jwt>
```

### Health

- `GET /health`

### Auth

- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/invite`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-everywhere`
- `GET /auth/me`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:id`
- `PATCH /auth/profile`
- `PATCH /auth/password`

### Workspaces

- `GET /workspaces`
- `POST /workspaces`
- `POST /workspaces/:id/switch`
- `GET /workspaces/:id/settings`
- `PATCH /workspaces/:id/settings`
- `GET /workspaces/:id/members`
- `POST /workspaces/:id/members`
- `PATCH /workspaces/:id/members/:userId`
- `DELETE /workspaces/:id/members/:userId`
- `GET /workspaces/:id/invites`
- `POST /workspaces/:id/invites`
- `DELETE /workspaces/:id/invites/:inviteId`

### Generated Accounts

- `GET /geo-rules`
- `GET /history`
- `GET /history/:id`
- `POST /accounts/generate`
- `POST /accounts/generate-bulk`
- `PATCH /history/:id/account-id`
- `PATCH /history/:id/balance-status`
- `PATCH /history/:id/sharing`
- `POST /history/:id/regenerate-phone`
- `POST /history/:id/refresh-inbox`
- `DELETE /history/:id`

### Mailboxes

- `POST /mailboxes/create`
- `GET /mailboxes/health`
- `POST /mailboxes/inbox`

### Usage, Alerts, Analytics

- `GET /limits`
- `GET /alerts`
- `GET /analytics/summary`
- `GET /activity`

### User Settings

- `GET /user/settings`
- `PATCH /user/settings`

## Important API Behavior

### Login Response

Login returns a JWT that includes the active workspace id. The default workspace is selected by `getDefaultWorkspaceForUser`.

When a workspace is switched, the backend returns a new token with the selected workspace id.

### History List

`GET /history` returns:

- own rows in active workspace;
- shared rows in active workspace;
- old legacy rows with `workspace_id IS NULL` only for their owning user.

It does not return every row in the workspace.

### History Mutations

Mutating generated account data requires:

- workspace role `owner`, `admin`, or `member`;
- ownership of that generated account row.

This applies to:

- refresh inbox;
- account id;
- balance status;
- phone regeneration;
- delete;
- share/unshare.

### History Limits

`workspace_settings.history_limit` is applied per creator inside a workspace. This prevents one member from deleting another member's recent history through bulk generation.

### Usage Limits

Usage events are tracked by workspace and user:

- `account_generated`;
- `mailbox_created`;
- `inbox_refreshed`.

Limits are evaluated for the current user inside the current workspace.

## Database Tables

Current main tables:

- `users`;
- `workspaces`;
- `workspace_members`;
- `workspace_settings`;
- `workspace_invites`;
- `user_settings`;
- `sessions`;
- `usage_events`;
- `activity_events`;
- `account_history`.

Schema migrations are lightweight and run from `backend/src/db.ts` through `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ensureColumn`.

## Environment

Important env vars:

- `JWT_SECRET`: required for production security;
- `CORS_ORIGINS`: comma-separated frontend origins allowed to call the backend with credentials in production;
- `ACCESS_TOKEN_TTL`: optional, default `30m`;
- `SESSION_DAYS`: optional, default `30`;
- `REGISTRATION_MODE`: `disabled` or `invite_only`;
- `SEED_USERS_JSON`: bootstrap users;
- `NEXT_PUBLIC_API_URL`: usually `/api` in browser-facing frontend;
- `LOCAL_API_TARGET`: local Next rewrite target;
- `MAIL_TM_BASE_URL`;
- `MAIL_TM_INBOX_POLL_ATTEMPTS`;
- `MAIL_TM_INBOX_POLL_DELAY_MS`;
- `MAIL_TM_REQUEST_TIMEOUT_MS`;
- `MAIL_TM_RETRY_ATTEMPTS`;
- `MAIL_TM_RETRY_DELAY_MS`;
- `GENERATION_INBOX_WAIT_MS`.

## Local Development

Install:

```bash
npm install
```

Run frontend and backend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:3000
```

Backend:

```text
http://localhost:4000
```

Run verification:

```bash
npm test
npm run build
git diff --check
```

## Production Deployment

Production uses Docker Compose:

```bash
docker compose up -d --build
```

Current production service exposes:

- `127.0.0.1:3000` for Next.js;
- `127.0.0.1:4000` for Express.

Nginx handles external HTTPS and `/api` routing.

Post-deploy smoke checks:

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/main
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/accounts
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/settings
```

Recommended authenticated smoke:

- login;
- `GET /api/workspaces`;
- `GET /api/history`;
- `POST /api/workspaces/:id/switch`.

## Known Constraints

- Outbound invite email is not implemented yet; invite links must be copied manually.
- Temporary mailbox delivery depends on `mail.tm` availability; requests now use timeout/retry and expose an authenticated health check, but there is not yet a second fallback provider.
- All generated identity data is synthetic and should be used only for QA/testing.
- Some GEO datasets are verified while others are synthetic-pattern or missing-rule quality.
- Frontend has focused Node unit tests for shared UI state helpers and Settings tab metadata; browser-level E2E coverage is still not implemented.
- Workspace archive/restore is available to workspace owners from Settings -> Workspace; archived workspaces remain visible in management but cannot be switched into.
- There is no billing or organization-level admin model.
