# Security Automation

The repository now runs security checks in GitHub Actions on pushes, pull requests, and manual dispatches.

## CI checks

- `Secret scan`: runs Gitleaks against full git history in CI.
- `CodeQL`: runs JavaScript/TypeScript analysis and uploads results to GitHub code scanning.
- `npm audit`: installs from `package-lock.json` and fails on high or critical non-optional npm advisories.

## Dependency maintenance

Dependabot checks npm workspaces and GitHub Actions weekly on Monday mornings in the Asia/Nicosia timezone.

## Current dependency-audit note

`npm audit fix --workspaces` was run on 2026-07-24 and updated fixable transitive dependencies, including the Express `body-parser` chain and the current Next.js patch release. A root `postcss` override keeps the workspace on a non-vulnerable PostCSS version.

The remaining high-severity finding in the full audit is Next.js' optional `sharp` dependency. `npm audit fix --force` proposed a breaking downgrade path, so it was intentionally not used. The CI audit omits optional dependencies until upstream Next.js publishes a clean upgrade path.

Local command:

```bash
npm audit --audit-level=high --workspaces --omit=optional
```
