# Test Account Generator V1

## Documentation

- [Current state](docs/CURRENT_STATE.md) - current product behavior, architecture, API, workspace/role/sharing model, env, and deployment notes.
- [Product backlog](docs/PRODUCT_BACKLOG.md) - planned improvements and newly captured follow-ups.
- [Backend roadmap](docs/BACKEND_ROADMAP.md) - older roadmap/planning notes.
- [Frontend roadmap](docs/FRONTEND_ROADMAP.md) - older frontend/product planning notes.
- [Project description](docs/PROJECT_DESCRIPTION.md) - older full project description with screenshots; use Current state as the source of truth for latest behavior.

## Stack
- Frontend: Next.js + TypeScript + Tailwind
- Backend: Node.js + Express + SQLite
- Infra: Dockerfile, docker-compose, nginx vhost

## Local run
```bash
npm install
npm run dev
```
Frontend: http://localhost:3000
Backend: http://localhost:4000

## Local API integration
By default, the frontend calls `/api` and Next.js rewrites that path to `http://127.0.0.1:4000` in local development. This keeps browser requests same-origin and avoids CORS setup for the standard local flow.

Use env overrides only when you need a different backend target:

```bash
# optional backend/frontend env
JWT_SECRET=dev-secret

# default browser API path, usually leave unset in local dev
NEXT_PUBLIC_API_URL=/api

# optional local rewrite target for Next dev server
LOCAL_API_TARGET=http://127.0.0.1:4000

MAIL_TM_BASE_URL=https://api.mail.tm
MAIL_TM_INBOX_POLL_ATTEMPTS=1
MAIL_TM_INBOX_POLL_DELAY_MS=2500
```

Notes:
- Leave `NEXT_PUBLIC_API_URL` unset or set it to `/api` for the normal local setup.
- Set `NEXT_PUBLIC_API_URL` to a full URL only when the frontend must talk to an external API directly.
- In production, keep `/api` routed through nginx to the backend.

## Default local users
- admin / admin123
- demo / demo123

Production should set `SEED_USERS_JSON` before first boot so the SQLite DB is initialized with strong credentials instead of the local defaults.

## Production deploy
1. Copy project to the server.
2. Create `.env.production` from `.env.production.example`.
3. Run `docker compose up -d --build`.
4. Install `deploy/nginx/test-acc-generator.touchpe.ru.conf` into nginx and reload it.

## V1 notes
- Document generation comes only from explicit geo-rules.
- Missing rules return `Missing Rules` and `missing_rules` quality.
- Email provider is abstracted behind `EmailProvider`; V1 now uses real `mail.tm` API integration.
- External launch links are intentionally out of scope. Operators generate account data, inspect mailbox activity, capture verification links/codes from email, and copy identity packs from one console.
- Passwords are stored for detail view, hidden by default, never shown in history list.
- History is capped at 50 per user and cleaned after 30 days.
- Inbox shows plain text plus extracted links/codes; raw HTML is debug-only.
