# Security Backlog

Last updated: 2026-07-24
Source audit: `test-acc-generator-security-audit`, checked at commit `f370762`.

This backlog is worked through the Security Working Group process:

- Project: why this matters now, impact, priority, acceptance.
- Developer: affected code/config, smallest safe fix, rollout risk, tests.
- QA: reproduction, negative cases, production verification.

## P0 - Immediate Containment

### SEC-001 - Rotate exposed production secrets and revoke sessions

Status: done operationally on 2026-07-17
Owner: Ops + Project
Impact: leaked `JWT_SECRET` and seed credentials can allow forged tokens and account takeover.

Project question: why now?
Answer: the secret was publicly present in Git history; assume compromise.

Developer question: what can break?
Answer: rotating `JWT_SECRET` logs everyone out; changing seed passwords may remove known break-glass access if not coordinated.

QA question: how to verify?
Answer: old JWTs fail, sessions table is empty/revoked, new login works only with rotated credentials.

Acceptance:

- production `JWT_SECRET` replaced;
- seed/user passwords rotated;
- active sessions revoked;
- container recreated with new env;
- available nginx access logs reviewed.

### SEC-002 - Require active session-bound JWTs

Status: implemented in first security remediation pass
Owner: Developer
Impact: forged JWT without `sessionId` currently bypasses session revocation.

Project question: why now?
Answer: this converts leaked JWT secret from full auth bypass into a much smaller risk after rotation.

Developer question: where is the fix?
Answer: `backend/src/index.ts` auth middleware and token signing options.

QA question: what negative test proves it?
Answer: a validly signed JWT without `sessionId` returns 401; a token with revoked session returns 401.

Acceptance:

- `sessionId` is required and must map to an active session;
- JWT issuer, audience, and algorithm are validated;
- tests cover missing session, revoked session, and valid session.

### SEC-003 - Remove production fallback seed credentials

Status: implemented in first security remediation pass
Owner: Developer
Impact: production can boot with known `admin/admin123` and `demo/demo123` if env is missing.

Project question: why now?
Answer: known fallback credentials are a direct takeover path after deploy/config mistakes.

Developer question: what can break?
Answer: local dev still needs convenient seeds; production must fail fast instead of silently creating defaults.

QA question: how to verify?
Answer: production-mode startup without `SEED_USERS_JSON` throws; dev still gets local seed users; existing passwords are not reset on restart.

Acceptance:

- production requires explicit non-empty `SEED_USERS_JSON`;
- seed loop does not overwrite existing password hashes;
- tests cover production fail-fast and no password reset.

### SEC-004 - Enforce HTTPS and containment at edge

Status: done operationally on 2026-07-17
Owner: Ops
Impact: HTTP can expose login, password, and JWT.

Project question: why now?
Answer: credentials sent over HTTP defeat most app-level auth hardening.

Developer question: where is the fix?
Answer: Cloudflare/nginx/TLS config, not only application code.

QA question: how to verify?
Answer: `http://...` returns 301/308 to HTTPS; HTTPS returns HSTS; direct origin is not publicly reachable except through intended path.

Acceptance:

- Cloudflare Always Use HTTPS or nginx redirect enabled;
- HSTS enabled after HTTPS confirmed;
- origin direct exposure reviewed.

## P1 - Next Release Security Fixes

### SEC-101 - Prevent workspace-admin owner takeover

Status: implemented in first security remediation pass
Owner: Developer
Impact: workspace admin can promote self to owner, demote owner, or remove owner.
Acceptance: only owners can grant/remove owner role; admins cannot mutate owners; self-promotion is blocked; tests cover takeover attempts.

### SEC-102 - Stop mailbox credential cross-provider leakage

Status: implemented in first security remediation pass
Owner: Developer
Impact: refresh can send `mail.tm` credentials to `mail.gw` or the reverse on fallback errors.
Acceptance: fallback is used only during mailbox creation; refresh uses stored provider only; tests prove wrong provider is not called.

### SEC-103 - Add auth rate limiting and async password verification

Status: implemented in second security remediation pass
Owner: Developer
Impact: login/register/refresh can be brute-forced and synchronous `scryptSync` can block the event loop.
Acceptance: rate limits by IP and normalized login; password length capped; password hashing/verification does not block the event loop; failed auth events are audited.

### SEC-104 - Make usage reservation atomic

Status: implemented in second security remediation pass
Owner: Developer
Impact: concurrent requests can bypass generation/mailbox limits.
Acceptance: quota is reserved in a SQLite transaction before external calls; tests cover atomic reservation behavior.

### SEC-105 - Add security headers and no-store API caching

Status: implemented operationally and in backend
Owner: Developer
Impact: missing headers increase XSS/clickjacking/token leakage risk.
Acceptance: Helmet or equivalent headers; `X-Powered-By` removed; auth/history/mailbox APIs return `Cache-Control: no-store`.

## P2 - Hardening

Recovery note from 2026-07-24:

- Production was recovered from `a721123 Keep access tokens out of local storage` and deployed through `f8f5f57 Implement Figma sidebar components and security cleanup`.
- The fourth pass was started but not finished before the Codex limit interruption on 2026-07-17.
- `SEC-203`, `SEC-204`, and the Figma sidebar/component implementation were committed, pushed, deployed, and production smoke-checked on 2026-07-24.
- Remaining open P2 work after this rollout: `SEC-202` and `SEC-205`.

### SEC-201 - Move access token out of localStorage

Status: implemented in third security remediation pass
Owner: Developer
Acceptance: access token held in memory; refresh token is HttpOnly, Secure, rotated on use.

### SEC-202 - Encrypt mailbox credentials and sensitive inbox data at rest

Status: implemented locally; pending production key injection, deploy, and migration smoke
Owner: Developer + Ops
Acceptance: envelope encryption with `DATA_ENCRYPTION_KEY`; migration plan; no key stored next to DB; old plaintext rows migrated or explicitly expired; backup/restore process documented.

Current implementation:

- added AES-256-GCM helper with `enc:v1` payload format and `DATA_ENCRYPTION_KEY` validation;
- production startup fails fast if `DATA_ENCRYPTION_KEY` is missing or invalid;
- new writes encrypt `email_password`, `inbox_plain_text`, `inbox_links_json`, `inbox_codes_json`, and `inbox_html`;
- reads remain backwards-compatible with existing plaintext rows;
- startup migrates plaintext sensitive account history rows when a key is configured;
- tests cover encrypted-at-rest writes, production missing-key fail-fast, and plaintext-to-encrypted startup migration.

Deployment notes:

- production SQLite backup was created before this work: `backend/data/backups/app-before-sec202-20260724125035.db` plus WAL/SHM;
- deploy requires setting `DATA_ENCRYPTION_KEY` in the server `.env.production` before rebuilding;
- after deploy, verify API health and sample encrypted row markers in SQLite without printing decrypted values.

### SEC-203 - Add scheduled retention cleanup

Status: deployed in fourth security remediation pass
Owner: Developer
Acceptance: periodic cleanup runs independently of user actions; retention logs/audit exist.

Current implementation:

- exports `cleanupOldHistory()`;
- starts a backend interval outside test mode;
- returns/logs deleted row count;
- adds a backend test for expired workspace history cleanup.

Remaining work:

- decide whether retention deletes should also record `activity_events` or another audit trail;
- optionally expose retention cleanup metrics in ops/health tooling.

### SEC-204 - Validate email links and block tracking images

Status: deployed in fourth security remediation pass
Owner: Developer + QA
Acceptance: only `https:` links open; hostname preview is shown; remote images blocked by default.

Current implementation:

- backend link normalization now drops non-HTTPS links;
- frontend opens extracted activation links only when they parse as HTTPS;
- email iframe `srcdoc` gets a restrictive CSP;
- email HTML sanitizer strips scripts, non-data images/srcset, and non-HTTPS hrefs;
- UI shows hostname preview next to the open-verification action.

Remaining work:

- replace fragile regex sanitizing with a proper HTML sanitizer if package policy allows, or add broader negative tests for mixed quoting, uppercase attributes, protocol-relative URLs, event handlers, forms, and meta refresh;
- check all extracted-link surfaces, including the Codes view, for consistent open/copy behavior and hostname visibility;
- smoke-test inbox rendering with a real provider message when a fresh provider email sample is available.

### SEC-205 - Remove `.env.production` from Git history

Status: planned; secret rotation is complete, but history rewrite is not started
Owner: Ops + Project
Acceptance: `git filter-repo` cleanup coordinated, force-push planned, all collaborators reset safely.

Remaining work:

- confirm all collaborators/remotes are ready for a force-pushed history rewrite;
- run `git filter-repo` or equivalent to remove historical `.env.production`;
- force-push only after coordination;
- document reset/reclone instructions for collaborators;
- re-run secret scanning after rewrite.

### SEC-206 - Add security automation in CI

Status: implemented on 2026-07-24
Owner: Developer
Acceptance: gitleaks, Dependabot, CodeQL or equivalent run in CI.

Current implementation:

- added `.github/workflows/security.yml` with Gitleaks, CodeQL, and npm audit jobs;
- added `.github/dependabot.yml` for npm workspace and GitHub Actions update PRs;
- upgraded fixable dependency chain with `npm audit fix --workspaces`;
- added a root `postcss` override so non-optional high severity npm audit is clean;
- documented the local audit command and the remaining optional Next.js `sharp` upstream blocker in `docs/SECURITY_AUTOMATION.md`.

Remaining work:

- review the first GitHub Actions run after push;
- remove the optional-audit exception once Next.js publishes a clean `sharp` upgrade path.
