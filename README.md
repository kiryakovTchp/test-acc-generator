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

## Demo users
- admin / admin123
- demo / demo123

## V1 notes
- Document generation comes only from explicit geo-rules.
- Missing rules return `Missing Rules` and `missing_rules` quality.
- Email provider is abstracted behind `EmailProvider`; current V1 provider is `mail.tm` stub.
- Passwords are stored for detail view, hidden by default, never shown in history list.
- History is capped at 50 per user and cleaned after 30 days.
- Inbox shows plain text plus extracted links/codes; raw HTML is debug-only.
