# Test Account Generator V1

Internal QA console for generating realistic test identities, temporary mailboxes, registration data, and email verification artifacts for manual account-registration workflows.

Production: https://test-acc-generator.touchpe.ru

## Screenshots

### Main Workspace

Generate one identity or a batch, pick GEO/persona/document/provider settings, watch usage limits, and open recent generated identities without leaving the workspace.

![Main workspace](docs/screenshots/01-main-workspace.png)

### Test Users

Search, filter, sort, update status/balance, share selected generated accounts with the workspace, and open full identity details.

![Test users page](docs/screenshots/02-accounts-page.png)

### Mailboxes

Create standalone temporary mailboxes, open generated account mailboxes, refresh inboxes, and inspect verification messages.

![Mailboxes page](docs/screenshots/03-mailboxes-page.png)

### Verification

Focus view for extracted numeric codes and HTTPS verification links from generated account inboxes.

![Verification page](docs/screenshots/04-codes-page.png)

### Settings

Manage generation defaults, workspace limits, invites, team roles, account security, sessions, analytics, and activity.

![Settings page](docs/screenshots/05-settings-page.png)

## What It Does

Test Account Generator V1 is built for operators and QA teammates who need test-registration packs quickly but still perform the final registration manually on external sites.

The app generates and tracks:

- realistic profile data by GEO and document rules;
- temporary email addresses through `mail.tm` and `mail.gw`;
- mailbox passwords, usernames, phone numbers, birth dates, addresses, documents, and issue dates;
- extracted inbox links and numeric verification codes;
- account id and balance/status fields entered by operators;
- workspace visibility, sharing, activity, limits, and session security.

The app does not automate sign-up on target websites. It prepares the identity pack, mailbox, and verification material in one operator console.

## Core Features

- Single identity generation with GEO, persona, document type, mailbox provider, and workspace defaults.
- Bulk generation with workspace/user quota reservation.
- Provider fallback support for mailbox creation.
- Inbox refresh, wait-and-refresh, extracted links, extracted codes, and mailbox replacement.
- Full generated-account table with search, GEO/status/balance filters, sharing controls, and detail modal.
- Private-by-default generated accounts with explicit workspace sharing.
- Workspaces with owner/admin/member/viewer roles.
- Invite-token registration and team management.
- Activity log for generation, sharing, invites, members, workspace changes, sessions, and password changes.
- Personal settings and interface language selection.
- Russian and English interface copy.

## Architecture

```text
Browser
  -> nginx HTTPS
    -> /       Next.js frontend on 127.0.0.1:3000
    -> /api/*  Express backend on 127.0.0.1:4000
        -> SQLite database mounted at backend/data/app.db
        -> mail.tm and mail.gw temporary-mail APIs
```

Repository layout:

```text
backend/
  src/
    index.ts                  Express API routes
    db.ts                     SQLite schema and migrations
    auth.ts                   password/session token hashing helpers
    permissions.ts            workspace role checks
    workspaces.ts             workspace helpers
    workspaceMembers.ts       member management
    invitations.ts            invite lifecycle
    activity.ts               activity log
    settings.ts               user/workspace settings
    limits.ts                 quota reservations and usage events
    monitoring.ts             alerts and analytics
    sensitiveData.ts          AES-256-GCM encrypted-at-rest helper
    services/accountService.ts
    providers/
    geo-rules.json

frontend/
  app/                        Next.js routes
  components/app-shell.tsx    main console UI
  lib/api.ts                  typed API client
  lib/i18n.ts                 interface translations

docs/
  screenshots/
  CURRENT_STATE.md
  SECURITY_BACKLOG.md
  SECURITY_AUTOMATION.md
```

## Security Posture

Current security backlog P0/P1/P2 items are closed as of 2026-07-24.

Implemented controls:

- production fails fast without explicit seed users, `JWT_SECRET`, and `DATA_ENCRYPTION_KEY`;
- password hashes use Node `scrypt`;
- active session-bound JWTs with issuer/audience/algorithm validation;
- httpOnly session cookies and account switching without storing access tokens in localStorage;
- session revocation, logout everywhere, profile/password security settings;
- production CORS allowlist and no-store caching for private APIs;
- auth rate limiting and auth event logging;
- atomic usage reservation for generation/mailbox limits;
- sensitive account history encrypted at rest with AES-256-GCM `enc:v1`;
- legacy plaintext sensitive rows are migrated on startup when a key is configured;
- email HTML is sanitized, remote tracking images are blocked, and extracted openable links must be HTTPS;
- scheduled retention cleanup for old account history;
- `.env.production` and historical env backup variants removed from Git history;
- GitHub Security workflow with Gitleaks, CodeQL, and npm audit;
- Dependabot configured for npm workspaces and GitHub Actions.

Sensitive encrypted fields:

- `email_password`;
- `inbox_plain_text`;
- `inbox_links_json`;
- `inbox_codes_json`;
- `inbox_html`.

Operational note: full npm audit may still report an optional `sharp` advisory through Next until the upstream dependency chain publishes a clean path. CI gates the high audit with optional dependencies omitted so deploys are not blocked by that upstream optional package.

## Backend API

Private routes require an authenticated session/JWT.

Main route groups:

- `GET /health`
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-everywhere`
- `GET /auth/me`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:id`
- `PATCH /auth/profile`
- `PATCH /auth/password`
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
- `GET /geo-rules`
- `GET /history`
- `GET /history/:id`
- `POST /accounts/generate`
- `POST /accounts/generate-bulk`
- `PATCH /history/:id/account-id`
- `PATCH /history/:id/balance-status`
- `PATCH /history/:id/sharing`
- `POST /history/:id/regenerate-phone`
- `POST /history/:id/replace-mailbox`
- `POST /history/:id/refresh-inbox`
- `DELETE /history/:id`
- `POST /mailboxes/create`
- `GET /mailboxes/health`
- `POST /mailboxes/inbox`
- `GET /limits`
- `GET /alerts`
- `GET /analytics/summary`
- `GET /activity`
- `GET /user/settings`
- `PATCH /user/settings`

## Local Development

Install dependencies:

```bash
npm install
```

Run frontend and backend together:

```bash
npm run dev
```

Local URLs:

- frontend: http://localhost:3000
- backend: http://localhost:4000

The frontend calls `/api` by default. In local development, `frontend/next.config.ts` rewrites `/api/*` to `http://127.0.0.1:4000`.

Default local users are intended only for development:

- `admin / admin123`
- `demo / demo123`

## Environment

Create production env from `.env.production.example` and set strong values:

```bash
JWT_SECRET=replace-with-strong-secret
DATA_ENCRYPTION_KEY=base64:replace-with-32-byte-base64-key
CORS_ORIGINS=https://test-acc-generator.touchpe.ru
NEXT_PUBLIC_API_URL=https://test-acc-generator.touchpe.ru/api
SEED_USERS_JSON=[{"login":"admin-live","password":"replace-with-strong-password","role":"admin"}]
MAIL_TM_BASE_URL=https://api.mail.tm
MAIL_GW_BASE_URL=https://api.mail.gw
```

Do not commit real `.env.production` files.

## Verification

Run the standard local checks:

```bash
npm test
npm run build
git diff --check
npm audit --audit-level=high --workspaces --omit=optional
```

Backend tests currently cover auth/session hardening, workspace permissions, usage limits, mailbox/provider behavior, retention cleanup, email-link safety, and encrypted-at-rest sensitive history.

Frontend tests cover shared UI state/settings helpers and localization-sensitive behavior.

## Production Deploy

Production uses Docker Compose:

```bash
docker compose up -d --build
```

Expected service bindings:

- Next.js frontend: `127.0.0.1:3000`
- Express backend: `127.0.0.1:4000`
- SQLite data: `./backend/data:/app/backend/data`

Post-deploy smoke:

```bash
curl -fsS https://test-acc-generator.touchpe.ru/api/health
curl -fsSI https://test-acc-generator.touchpe.ru/main
curl -fsSI https://test-acc-generator.touchpe.ru/accounts
curl -fsSI https://test-acc-generator.touchpe.ru/settings
```

## More Documentation

- [Current state](docs/CURRENT_STATE.md)
- [Security backlog](docs/SECURITY_BACKLOG.md)
- [Security automation](docs/SECURITY_AUTOMATION.md)
- [Product backlog](docs/PRODUCT_BACKLOG.md)
- [Backend roadmap](docs/BACKEND_ROADMAP.md)
- [Frontend roadmap](docs/FRONTEND_ROADMAP.md)
