# Backend roadmap - auth, workspaces, limits

Дата: 2026-06-12  
Статус: продуктовый roadmap, не current-state документация  
Цель: превратить internal V1 backend из seed-user QA консоли в нормальную product-like/self-hosted модель с регистрацией, workspaces, ролями, лимитами и стабильным generation pipeline.

## 1. Current state

Сейчас backend устроен просто:

```text
SEED_USERS_JSON / local fallback users
  -> POST /auth/login
  -> JWT на 12h
  -> frontend хранит token в localStorage
  -> account_history привязана к user_id
```

Для internal V1 это приемлемо, но для open-source/product-like версии этого недостаточно.

Основные текущие ограничения:

- пользователи создаются через seed, а не через регистрацию;
- пароль хранится открытым текстом в `users.password`;
- нет `email`, `username`, `status`, `updated_at`;
- нет workspaces;
- нет team/members model;
- история привязана напрямую к `user_id`;
- нет нормальных generation limits;
- нет sessions table;
- logout на frontend просто чистит localStorage;
- access token живет 12 часов;
- refresh/session token отсутствует;
- settings в UI сейчас browser-local, а не server-side;
- error responses в generation flow не нормализованы по кодам.

## 2. Target backend model

Нужно перейти к модели:

```text
user
  -> owns / joins workspace
  -> generates accounts inside workspace
  -> account_history belongs to workspace
  -> limits resolve by user + workspace
```

Даже если в V1 будет один workspace на пользователя, структуру workspace нужно заложить сразу. Иначе при появлении QA-команды придется болезненно мигрировать `account_history.user_id` в shared model.

## 3. Users

Целевая таблица:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  status TEXT NOT NULL CHECK(status IN ('active','pending','disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Минимально для V1:

- `email`;
- `username`;
- `password_hash`;
- `role`;
- `status`;
- timestamps.

`SEED_USERS_JSON` больше не должен быть основной моделью пользователей.

Оставить `SEED_USERS_JSON` только для:

- первого admin/owner пользователя;
- self-hosted bootstrap;
- dev/local mode;
- emergency access при установке.

## 4. Workspaces

Целевые таблицы:

```sql
CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE workspace_members (
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Для V1 можно автоматически создавать default workspace при регистрации:

```text
username's workspace
```

или:

```text
Default workspace
```

Важное правило: все account operations должны выполняться в контексте workspace.

## 5. Roles

Полная модель:

| Role | Что может |
| --- | --- |
| `owner` | Управляет workspace, settings, users, billing/limits в будущем |
| `admin` | Управляет аккаунтами и workspace settings |
| `member` | Генерирует аккаунты и смотрит свои/общие аккаунты |
| `viewer` | Только смотрит историю |

Для ближайшего V1 можно реализовать только:

- `owner`;
- `member`.

Но нельзя оставлять один глобальный `admin-live` как основную модель.

Минимальная матрица прав для V1:

| Действие | owner | member | viewer |
| --- | --- | --- | --- |
| Генерировать account | да | да | нет |
| Смотреть history | да | да | да |
| Смотреть mailbox/inbox | да | да | да |
| Refresh inbox | да | да | нет |
| Управлять workspace settings | да | нет | нет |
| Управлять users/members | да | нет | нет |

## 6. account_history migration

Current:

```sql
account_history.user_id
```

Target:

```sql
account_history.workspace_id
account_history.created_by_user_id
```

Migration path:

1. Add nullable columns:

```sql
ALTER TABLE account_history ADD COLUMN workspace_id INTEGER;
ALTER TABLE account_history ADD COLUMN created_by_user_id INTEGER;
```

2. For every existing user, create a default workspace.
3. Backfill existing history:

```text
workspace_id = user's default workspace
created_by_user_id = old user_id
```

4. Add indexes:

```sql
CREATE INDEX idx_account_history_workspace_created_at
ON account_history(workspace_id, created_at DESC);

CREATE INDEX idx_account_history_created_by_user
ON account_history(created_by_user_id, created_at DESC);
```

5. Update all service queries to filter by workspace membership, not only `user_id`.
6. Keep `user_id` temporarily for backward compatibility.
7. Remove or ignore `user_id` after code is stable.

Recommended query rule:

```text
User can access account_history row only if:
  row.workspace_id is in workspaces where user is a member
```

## 7. Auth target

Replace:

```text
login/password from seed -> JWT 12h -> localStorage
```

With:

```text
email/login + password
  -> password hash verify
  -> short access token
  -> refresh/session token in httpOnly cookie
  -> sessions table
```

Password hashing:

- preferred: `argon2id`;
- acceptable: `bcrypt`;
- never store plaintext passwords.

Access token:

- short TTL, for example 15 minutes;
- signed JWT;
- contains `userId`, `sessionId`, maybe current `workspaceId`.

Refresh/session token:

- stored in httpOnly cookie;
- long TTL, for example 7-30 days;
- token hash stored in `sessions`;
- rotate on refresh if practical.

Sessions table:

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Logout:

- revoke current session in DB;
- clear refresh cookie;
- frontend clears access token state.

## 8. Registration modes

Add env:

```text
REGISTRATION_MODE=open | invite_only | disabled
```

Behavior:

| Mode | Behavior |
| --- | --- |
| `open` | Anyone can register |
| `invite_only` | Registration only with invite token |
| `disabled` | Only seeded/bootstrap users |

For public service:

```text
REGISTRATION_MODE=open
```

For self-hosted companies:

```text
REGISTRATION_MODE=invite_only
```

or:

```text
REGISTRATION_MODE=disabled
```

Invite table for later:

```sql
CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER,
  email TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')) DEFAULT 'member',
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Invite table can wait, but API shape should not block it.

## 9. User and workspace settings

Current UI settings are browser-local:

```text
tag-workspace-settings in localStorage
```

Target split:

| Settings type | Storage |
| --- | --- |
| Personal generation defaults | `user_settings` |
| Workspace settings | database |
| System settings | env/admin panel |

User settings:

```sql
CREATE TABLE user_settings (
  user_id INTEGER PRIMARY KEY,
  default_geo TEXT,
  default_persona TEXT,
  default_document_type TEXT,
  bulk_count INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Workspace settings:

```sql
CREATE TABLE workspace_settings (
  workspace_id INTEGER PRIMARY KEY,
  history_retention_days INTEGER NOT NULL DEFAULT 30,
  history_limit INTEGER NOT NULL DEFAULT 50,
  allow_bulk_generation INTEGER NOT NULL DEFAULT 1,
  max_bulk_count INTEGER NOT NULL DEFAULT 25,
  mailbox_provider TEXT NOT NULL DEFAULT 'mail_tm',
  accounts_per_day INTEGER NOT NULL DEFAULT 25,
  mailbox_create_per_day INTEGER NOT NULL DEFAULT 25,
  inbox_refresh_per_minute INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
```

Frontend should still cache settings locally for responsiveness, but backend must be source of truth.

## 10. Limits

If registration is open, limits are mandatory. Otherwise random users can burn mail.tm.

V1 suggested limits:

| Limit | Suggested V1 value |
| --- | --- |
| Accounts per day | 25 |
| Bulk max | 10 or 25 |
| Inbox refresh per minute | 10 |
| Mailbox create per day | 25 |
| History limit | 50 or 100 |

Implementation options:

1. Query account_history counts by date for account/mailbox create.
2. Add event table for rate-limited actions.

Better general model:

```sql
CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_usage_events_user_type_created_at
ON usage_events(user_id, event_type, created_at DESC);

CREATE INDEX idx_usage_events_workspace_type_created_at
ON usage_events(workspace_id, event_type, created_at DESC);
```

Event types:

- `account_generate`;
- `bulk_generate`;
- `mailbox_create`;
- `inbox_refresh`;
- `login_attempt`;
- `register_attempt`.

UI should show usage:

```text
12 / 25 accounts generated today
```

API should return limits in a normalized object:

```json
{
  "limits": {
    "accountsPerDay": { "used": 12, "limit": 25 },
    "mailboxesPerDay": { "used": 8, "limit": 25 },
    "inboxRefreshPerMinute": { "used": 2, "limit": 10 },
    "bulkMax": { "limit": 10 }
  }
}
```

## 11. Stable generation pipeline

Current generation works, but errors are mostly generic. Target pipeline:

```text
validate request
  -> resolve workspace/user limits
  -> resolve GEO
  -> resolve document rule
  -> create mailbox
  -> generate identity
  -> generate credentials
  -> save account history
  -> initial inbox check
  -> return normalized account detail
```

Every step should have a typed error.

Required error codes:

| Code | Meaning |
| --- | --- |
| `unsupported_geo` | GEO is not supported |
| `unsupported_document_type` | Document type is not supported for selected GEO |
| `mailbox_provider_error` | mail.tm or another provider failed |
| `generation_limit_reached` | User/workspace reached generation limit |
| `history_save_failed` | Account was generated but history was not saved |
| `inbox_check_failed` | Mailbox was created, but inbox check failed |

Preferred API error shape:

```json
{
  "error": {
    "code": "generation_limit_reached",
    "message": "Daily account generation limit reached",
    "details": {
      "used": 25,
      "limit": 25
    }
  }
}
```

Important behavior:

- `mailbox_provider_error` should stop generation before saving history.
- `inbox_check_failed` should not necessarily fail the whole account generation if mailbox and identity were created; save account with `inbox_status = no_email_found` or `inbox_check_failed` metadata and return a warning.
- `history_save_failed` is serious because the operator may lose generated credentials. Consider returning generated account payload with warning if possible, but do not silently drop it.

## 12. API roadmap

### Auth

New endpoints:

```http
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET /auth/me
```

Register request:

```json
{
  "email": "user@example.com",
  "username": "qa-user",
  "password": "..."
}
```

Login request:

```json
{
  "login": "user@example.com",
  "password": "..."
}
```

`login` should accept either email or username.

`GET /auth/me` response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "qa-user",
    "role": "owner",
    "status": "active"
  },
  "workspaces": [
    {
      "id": 1,
      "name": "Default workspace",
      "role": "owner"
    }
  ],
  "currentWorkspaceId": 1
}
```

### Workspace

```http
GET /workspaces
POST /workspaces
GET /workspaces/:id/members
POST /workspaces/:id/members/invite
PATCH /workspaces/:id/settings
GET /workspaces/:id/settings
```

For V1, workspace creation can be automatic and manual workspace management can come later.

### User settings

```http
GET /user/settings
PATCH /user/settings
```

### Limits

```http
GET /limits
```

or include limits in:

```http
GET /auth/me
```

### Accounts

Existing endpoints should gain workspace context.

Options:

1. Header:

```http
X-Workspace-Id: 1
```

2. Path:

```http
GET /workspaces/:workspaceId/history
POST /workspaces/:workspaceId/accounts/generate
```

Recommended for clarity:

```http
/workspaces/:workspaceId/...
```

But to reduce frontend churn, V1 migration can temporarily support both.

## 13. Migration phases

### Phase 0 - documentation and tests

- Create this roadmap.
- Add backend tests for current auth/history/generation before changing behavior.
- Add fixtures for existing `SEED_USERS_JSON` users.

### Phase 1 - schema expansion, no behavior break

- Add `email`, `username`, `password_hash`, `status`, `updated_at` columns or create new users table migration path.
- Add `workspaces`.
- Add `workspace_members`.
- Add `workspace_settings`.
- Add `user_settings`.
- Add `sessions`.
- Add `usage_events`.
- Add `workspace_id`, `created_by_user_id` to `account_history`.
- Backfill default workspace for existing users.
- Keep current login working.

No production behavior should break in this phase.

### Phase 2 - password hashing and seed bootstrap

- Introduce password hash helpers.
- Convert seeded users to hashed users.
- Keep `SEED_USERS_JSON` accepted for bootstrap, but store hash in DB.
- Add compatibility check for old plaintext password rows and upgrade hash on successful login.

Recommended:

```text
if password_hash exists -> verify hash
else if old password column matches -> create password_hash, clear/ignore password
```

### Phase 3 - register/login/session API

- Add `POST /auth/register`.
- Add `POST /auth/login` with email/username login.
- Add refresh/session cookie.
- Add `sessions` storage.
- Add `POST /auth/logout`.
- Add login/register rate limiting.
- Add `REGISTRATION_MODE`.

Frontend can still use existing UI until new screens are ready.

### Phase 4 - workspace-aware account operations

- Update auth context to resolve current workspace.
- Update history list/detail queries to use workspace membership.
- Update generate/refresh/delete to use `workspace_id`.
- Add permission checks.
- Add workspace settings lookup for limits/history retention.

### Phase 5 - limits

- Implement usage event recording.
- Enforce:
  - accounts/day;
  - mailbox create/day;
  - inbox refresh/min;
  - bulk max;
  - history limit.
- Return typed `generation_limit_reached`.
- Add `/limits` response.

### Phase 6 - frontend migration

- Replace local-only auth assumptions.
- Add sign up page.
- Add login by email/username.
- Store access token in memory or short-lived storage.
- Use refresh cookie for session restore.
- Add server-side settings page.
- Show usage limits in UI.
- Add workspace switcher later if multiple workspaces are enabled.

### Phase 7 - cleanup

- Stop relying on `users.password`.
- Treat `SEED_USERS_JSON` only as bootstrap.
- Remove old user_id-only queries.
- Remove old localStorage-only settings behavior or keep as cache.

## 14. Backward compatibility rules

Production should not break while this moves.

Rules:

- Existing accounts in `account_history` must remain visible.
- Existing prod users must be migrated into default workspaces.
- Existing login credentials should work during transition.
- A failed inbox check should not lose generated mailbox credentials.
- New auth/session should be introduced behind compatible API responses where possible.
- `SEED_USERS_JSON` should still be usable for self-hosted bootstrap.

## 15. Recommended implementation order

Best order:

1. Add schemas and migration helpers.
2. Add tests around migration/backfill.
3. Add user/workspace service layer.
4. Add password hashing.
5. Add sessions table and auth service.
6. Add registration modes.
7. Add workspace-aware history queries.
8. Add limits service.
9. Refactor generation pipeline to explicit step result/error model.
10. Update frontend auth/settings/limits UI.

Do not start with UI. The risky part is backend data ownership and session correctness.

## 16. Definition of done

This roadmap is done when:

- new user can sign up;
- user can login by email or username;
- passwords are hashed;
- session refresh works via httpOnly cookie;
- logout revokes session;
- every user has at least one workspace;
- history belongs to workspace;
- account generation checks limits before touching mail.tm;
- generation errors use stable codes;
- UI shows usage limits;
- old prod accounts still show after migration;
- `SEED_USERS_JSON` is only bootstrap/dev, not primary user management.

