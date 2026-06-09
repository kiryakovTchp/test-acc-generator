# Test Account Generator V1

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

## Local env
Optional backend/frontend env:
```bash
JWT_SECRET=dev-secret
NEXT_PUBLIC_API_URL=http://localhost:4000
MAIL_TM_BASE_URL=https://api.mail.tm
MAIL_TM_INBOX_POLL_ATTEMPTS=1
MAIL_TM_INBOX_POLL_DELAY_MS=2500
```

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
- Passwords are stored for detail view, hidden by default, never shown in history list.
- History is capped at 50 per user and cleaned after 30 days.
- Inbox shows plain text plus extracted links/codes; raw HTML is debug-only.
