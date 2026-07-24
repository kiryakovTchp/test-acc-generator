import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { MailTmProvider } from './providers/mailTmProvider.js';
import { MailGwProvider } from './providers/mailGwProvider.js';
import { FallbackEmailProvider } from './providers/fallbackEmailProvider.js';
import type { EmailProvider } from './providers/emailProvider.js';
import { buildInboxPayload, cleanupOldHistory, deleteHistory, generateAccount, getHistoryDetail, getRefreshMailboxProviderKey, listGeoRules, listHistory, refreshInbox, regeneratePhone, replaceMailbox, updateAccountBalanceStatus, updateHistorySharing, updatePhone, updateSiteAccountId } from './services/accountService.js';
import type { PersonaKey, Role } from './types.js';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { addDays, hashPasswordAsync, hashSessionToken, newSessionToken, verifyPasswordAsync } from './auth.js';
import { ApiError, getUsageSummary, getWorkspaceSettings, reserveUsage, reserveUsageBatch, USAGE_EVENTS } from './limits.js';
import { assertRateLimit } from './rateLimit.js';
import { assertCanReadWorkspaceSettings, getUserSettings, getWorkspaceSettingsForApi, updateUserSettings, updateWorkspaceSettings } from './settings.js';
import { assertWorkspaceRole, getWorkspaceRole, type WorkspaceRole } from './permissions.js';
import { addWorkspaceMember, listWorkspaceMembers, removeWorkspaceMember, updateWorkspaceMemberRole } from './workspaceMembers.js';
import { createWorkspaceInvite, getPublicInvite, listWorkspaceInvites, registerUserWithInvite, revokeWorkspaceInvite } from './invitations.js';
import { getWorkspaceAlerts, getWorkspaceAnalytics } from './monitoring.js';
import { createWorkspace, getWorkspaceForUser, listWorkspaces, updateWorkspaceStatus } from './workspaces.js';
import { listActivityEvents, recordActivity } from './activity.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = resolveJwtSecret();
const accessTokenTtl = (process.env.ACCESS_TOKEN_TTL ?? '30m') as SignOptions['expiresIn'];
const jwtIssuer = process.env.JWT_ISSUER ?? 'test-account-generator';
const jwtAudience = process.env.JWT_AUDIENCE ?? 'test-account-generator-ui';
const sessionDays = Number(process.env.SESSION_DAYS ?? 30);
const registrationMode = process.env.REGISTRATION_MODE ?? 'disabled';
const maxPasswordLength = Number(process.env.MAX_PASSWORD_LENGTH ?? 256);
const mailTmProvider = new MailTmProvider();
const mailGwProvider = new MailGwProvider();
const fallbackEmailProvider = new FallbackEmailProvider(mailTmProvider, mailGwProvider);
const sessionCookieName = 'tag_session';
const accountSessionCookiePrefix = 'tag_session_user_';

app.disable('x-powered-by');
app.use(cors({ credentials: true, origin: resolveCorsOrigin }));
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: jwtIssuer,
      audience: jwtAudience,
    }) as { userId: number; login: string; role: Role; sessionId?: number; workspaceId?: number };
    if (!Number.isInteger(decoded.sessionId) || Number(decoded.sessionId) <= 0) {
      return res.status(401).json({ error: 'Session required' });
    }
    const sessionId = Number(decoded.sessionId);
    const user = db.prepare('SELECT id, login, role, status FROM users WHERE id = ? OR login = ? LIMIT 1').get(decoded.userId, decoded.login) as { id: number; login: string; role: Role; status: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'User is not active' });
    }
    if (!isSessionActive(sessionId, user.id)) {
      return res.status(401).json({ error: 'Session expired' });
    }
    const workspaceId = decoded.workspaceId ?? getDefaultWorkspaceForUser(user.id);
    const workspaceRole = getWorkspaceRole(user.id, workspaceId);
    if (!workspaceRole) {
      return res.status(403).json({ error: 'Workspace access denied', code: 'workspace_access_denied' });
    }
    (req as any).user = { userId: user.id, login: user.login, role: user.role, workspaceRole, sessionId, workspaceId };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/login', async (req, res) => {
  const login = String(req.body?.login ?? '').trim();
  const password = String(req.body?.password ?? '');
  const ipAddress = requestIp(req);
  if (!login || password.length > maxPasswordLength) {
    recordAuthEvent(login, ipAddress, false, 'invalid_payload');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const user = db.prepare('SELECT id, login, password, password_hash, role, email, username, status FROM users WHERE login = ? OR email = ? OR username = ? LIMIT 1').get(login, login, login) as any;
  try {
    assertRateLimit(`login:${ipAddress}:${login.toLowerCase()}`, {
      limit: 8,
      windowMs: 10 * 60 * 1000,
      code: 'auth_rate_limited',
      message: 'Too many login attempts',
    });
  } catch (error) {
    recordAuthEvent(login, ipAddress, false, 'rate_limited');
    return sendError(res, error, 'Login rate limit exceeded');
  }
  if (!user || user.status !== 'active' || !(await verifyPasswordAsync(password, user.password_hash, user.password))) {
    recordAuthEvent(login, ipAddress, false, user && user.status !== 'active' ? 'inactive_user' : 'invalid_credentials');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!user.password_hash) {
    db.prepare('UPDATE users SET password_hash = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(await hashPasswordAsync(password), '', user.id);
  }
  const session = createSession(user.id, req);
  setActiveSessionCookie(res, session.token, session.expiresAt);
  setAccountSessionCookie(res, user.id, session.token, session.expiresAt);
  recordAuthEvent(login, ipAddress, true);
  res.json(buildAuthResponse(user, session.id));
});

app.post('/auth/register', async (req, res) => {
  if (registrationMode === 'disabled') {
    return res.status(403).json({ error: 'Registration is disabled', code: 'registration_disabled' });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password ?? '');
  if (!email || !email.includes('@') || !username || password.length < 8 || password.length > maxPasswordLength) {
    return res.status(400).json({ error: 'Valid email, username, and 8+ character password are required', code: 'invalid_registration_payload' });
  }

  try {
    assertRateLimit(`register:${requestIp(req)}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
      code: 'auth_rate_limited',
      message: 'Too many registration attempts',
    });
    if (registrationMode === 'invite_only') {
      const inviteToken = String(req.body?.inviteToken ?? '').trim();
      if (!inviteToken) {
        return res.status(403).json({ error: 'Invite token is required', code: 'invite_required' });
      }
      const user = registerUserWithInvite({ inviteToken, email, username, passwordHash: await hashPasswordAsync(password) });
      const session = createSession(user.id, req);
      setActiveSessionCookie(res, session.token, session.expiresAt);
      setAccountSessionCookie(res, user.id, session.token, session.expiresAt);
      return res.status(201).json(buildAuthResponse(user, session.id));
    }

    const result = db.prepare(`
      INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
      VALUES (?, '', ?, 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
    `).run(username, await hashPasswordAsync(password), email, username);
    const userId = Number(result.lastInsertRowid);
    getDefaultWorkspaceForUser(userId);
    const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get(userId) as any;
    const session = createSession(user.id, req);
    setActiveSessionCookie(res, session.token, session.expiresAt);
    setAccountSessionCookie(res, user.id, session.token, session.expiresAt);
    res.status(201).json(buildAuthResponse(user, session.id));
  } catch (error) {
    if (error instanceof ApiError) {
      return sendError(res, error, 'Registration failed');
    }
    res.status(409).json({ error: 'User already exists', code: 'user_already_exists' });
  }
});

app.get('/auth/invite', (req, res) => {
  try {
    const inviteToken = String(req.query.token ?? '').trim();
    if (!inviteToken) {
      throw new ApiError('invite_required', 'Invite token is required', 403);
    }
    res.json({ invite: getPublicInvite(inviteToken) });
  } catch (error) {
    sendError(res, error, 'Invite lookup failed');
  }
});

app.post('/auth/refresh', (req, res) => {
  try {
    assertRateLimit(`refresh:${requestIp(req)}`, {
      limit: 60,
      windowMs: 5 * 60 * 1000,
      code: 'auth_rate_limited',
      message: 'Too many refresh attempts',
    });
  } catch (error) {
    return sendError(res, error, 'Refresh rate limit exceeded');
  }
  const sessionToken = readCookie(req, sessionCookieName);
  if (!sessionToken) return res.status(401).json({ error: 'No active session' });

  const session = db.prepare(`
    SELECT id, user_id
    FROM sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(hashSessionToken(sessionToken)) as { id: number; user_id: number } | undefined;
  if (!session) return res.status(401).json({ error: 'Session expired' });

  const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get(session.user_id) as any;
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Unauthorized' });
  const preferredWorkspaceId = resolvePreferredWorkspaceId(user.id, req.body?.workspaceId);
  const rotatedSession = rotateSession(session.id, session.user_id, req);
  setActiveSessionCookie(res, rotatedSession.token, rotatedSession.expiresAt);
  setAccountSessionCookie(res, user.id, rotatedSession.token, rotatedSession.expiresAt);
  res.json(buildAuthResponse(user, rotatedSession.id, preferredWorkspaceId));
});

app.post('/auth/switch-account', (req, res) => {
  try {
    assertRateLimit(`switch-account:${requestIp(req)}`, {
      limit: 30,
      windowMs: 5 * 60 * 1000,
      code: 'auth_rate_limited',
      message: 'Too many account switch attempts',
    });
  } catch (error) {
    return sendError(res, error, 'Account switch rate limit exceeded');
  }

  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'User id is required', code: 'invalid_switch_account_payload' });
  }

  const sessionToken = readCookie(req, accountSessionCookieName(userId));
  if (!sessionToken) return res.status(401).json({ error: 'No saved session for this account', code: 'saved_session_missing' });

  const session = db.prepare(`
    SELECT id, user_id
    FROM sessions
    WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(hashSessionToken(sessionToken), userId) as { id: number; user_id: number } | undefined;
  if (!session) return res.status(401).json({ error: 'Saved session expired', code: 'saved_session_expired' });

  const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get(session.user_id) as any;
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Unauthorized' });

  const preferredWorkspaceId = resolvePreferredWorkspaceId(user.id, req.body?.workspaceId);
  const rotatedSession = rotateSession(session.id, session.user_id, req);
  setActiveSessionCookie(res, rotatedSession.token, rotatedSession.expiresAt);
  setAccountSessionCookie(res, user.id, rotatedSession.token, rotatedSession.expiresAt);
  res.json(buildAuthResponse(user, rotatedSession.id, preferredWorkspaceId));
});

app.post('/auth/logout', auth, (req, res) => {
  if ((req as any).user.sessionId) {
    db.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run((req as any).user.sessionId, (req as any).user.userId);
  }
  clearActiveSessionCookie(res);
  clearAccountSessionCookie(res, (req as any).user.userId);
  res.status(204).send();
});

app.post('/auth/logout-everywhere', auth, (req, res) => {
  const result = db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND revoked_at IS NULL
  `).run((req as any).user.userId);
  recordActivity({
    workspaceId: (req as any).user.workspaceId,
    userId: (req as any).user.userId,
    eventType: 'sessions_revoked',
    entityType: 'session',
    summary: 'Logged out everywhere',
    metadata: { revokedCount: result.changes },
  });
  clearActiveSessionCookie(res);
  clearAccountSessionCookie(res, (req as any).user.userId);
  res.status(204).send();
});

app.get('/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, login, email, username, role, status, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?').get((req as any).user.userId) as any;
  res.json({ user: { ...user, workspaceId: (req as any).user.workspaceId, workspaceRole: (req as any).user.workspaceRole } });
});

app.get('/auth/sessions', auth, (req, res) => {
  const sessions = db.prepare(`
    SELECT id,
           user_agent as userAgent,
           ip_address as ipAddress,
           expires_at as expiresAt,
           created_at as createdAt,
           last_seen_at as lastSeenAt,
           CASE WHEN id = ? THEN 1 ELSE 0 END as isCurrent
    FROM sessions
    WHERE user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    ORDER BY datetime(COALESCE(last_seen_at, created_at)) DESC
    LIMIT 50
  `).all((req as any).user.sessionId ?? 0, (req as any).user.userId);
  res.json({ sessions });
});

app.delete('/auth/sessions/:id', auth, (req, res) => {
  const sessionId = Number(req.params.id);
  const result = db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(sessionId, (req as any).user.userId);
  if (result.changes > 0) {
    recordActivity({
      workspaceId: (req as any).user.workspaceId,
      userId: (req as any).user.userId,
      eventType: 'session_revoked',
      entityType: 'session',
      entityId: sessionId,
      summary: sessionId === (req as any).user.sessionId ? 'Revoked current session' : 'Revoked another session',
      metadata: { sessionId, current: sessionId === (req as any).user.sessionId },
    });
  }
  if (sessionId === (req as any).user.sessionId) {
    clearActiveSessionCookie(res);
    clearAccountSessionCookie(res, (req as any).user.userId);
  }
  res.status(204).send();
});

app.patch('/auth/profile', auth, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const username = normalizeUsername(req.body?.username);
  if (!email || !username) {
    return res.status(400).json({ error: 'Valid email and username are required', code: 'invalid_profile_payload' });
  }
  try {
    db.prepare(`
      UPDATE users
      SET email = ?, username = ?, login = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(email, username, username, (req as any).user.userId);
    const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get((req as any).user.userId) as any;
    res.json(buildAuthResponse(user, (req as any).user.sessionId ?? 0, (req as any).user.workspaceId));
  } catch {
    res.status(409).json({ error: 'Email or username is already in use', code: 'user_already_exists' });
  }
});

app.patch('/auth/password', auth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const nextPassword = String(req.body?.newPassword ?? '');
  if (nextPassword.length < 8 || nextPassword.length > maxPasswordLength || currentPassword.length > maxPasswordLength) {
    return res.status(400).json({ error: 'New password must be at least 8 characters', code: 'invalid_password_payload' });
  }
  const user = db.prepare('SELECT id, password, password_hash FROM users WHERE id = ?').get((req as any).user.userId) as any;
  if (!user || !(await verifyPasswordAsync(currentPassword, user.password_hash, user.password))) {
    return res.status(403).json({ error: 'Current password is incorrect', code: 'current_password_invalid' });
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, password = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(await hashPasswordAsync(nextPassword), (req as any).user.userId);
  db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND id != ? AND revoked_at IS NULL
  `).run((req as any).user.userId, (req as any).user.sessionId ?? 0);
  recordActivity({
    workspaceId: (req as any).user.workspaceId,
    userId: (req as any).user.userId,
    eventType: 'password_changed',
    entityType: 'user',
    entityId: (req as any).user.userId,
    summary: 'Changed account password',
  });
  res.status(204).send();
});

app.get('/geo-rules', auth, (_req, res) => res.json({ items: listGeoRules() }));

app.get('/history', auth, (req, res) => {
  res.json({ items: listHistory((req as any).user.userId, (req as any).user.workspaceId) });
});

app.get('/workspaces', auth, (req, res) => {
  res.json({ workspaces: listWorkspaces((req as any).user.userId) });
});

app.post('/workspaces', auth, (req, res) => {
  try {
    const workspace = createWorkspace((req as any).user.userId, req.body ?? {}, (req as any).user.workspaceId);
    const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get((req as any).user.userId) as any;
    res.status(201).json({ workspace, workspaces: listWorkspaces(user.id), ...buildAuthResponse(user, (req as any).user.sessionId ?? 0, workspace.id) });
  } catch (error) {
    sendError(res, error, 'Failed to create workspace');
  }
});

app.post('/workspaces/:id/switch', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    getWorkspaceForUser((req as any).user.userId, workspaceId);
    const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get((req as any).user.userId) as any;
    res.json({ workspaces: listWorkspaces(user.id), ...buildAuthResponse(user, (req as any).user.sessionId ?? 0, workspaceId) });
  } catch (error) {
    sendError(res, error, 'Failed to switch workspace');
  }
});

app.patch('/workspaces/:id/status', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    const workspace = updateWorkspaceStatus((req as any).user.userId, workspaceId, req.body ?? {});
    const preferredWorkspaceId = workspace.status === 'archived' && workspaceId === (req as any).user.workspaceId
      ? getDefaultWorkspaceForUser((req as any).user.userId)
      : (req as any).user.workspaceId;
    const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get((req as any).user.userId) as any;
    res.json({ workspace, workspaces: listWorkspaces(user.id), ...buildAuthResponse(user, (req as any).user.sessionId ?? 0, preferredWorkspaceId) });
  } catch (error) {
    sendError(res, error, 'Failed to update workspace status');
  }
});

app.get('/limits', auth, (req, res) => {
  res.json(getUsageSummary((req as any).user.workspaceId, (req as any).user.userId));
});

app.get('/alerts', auth, (req, res) => {
  res.json({ items: getWorkspaceAlerts((req as any).user.workspaceId, (req as any).user.userId) });
});

app.get('/analytics/summary', auth, (req, res) => {
  res.json({ summary: getWorkspaceAnalytics((req as any).user.workspaceId, (req as any).user.userId) });
});

app.get('/activity', auth, (req, res) => {
  try {
    res.json({ items: listActivityEvents((req as any).user.workspaceId, (req as any).user.userId) });
  } catch (error) {
    sendError(res, error, 'Failed to load activity');
  }
});

app.get('/user/settings', auth, (req, res) => {
  res.json({ settings: getUserSettings((req as any).user.userId) });
});

app.patch('/user/settings', auth, (req, res) => {
  res.json({ settings: updateUserSettings((req as any).user.userId, req.body ?? {}) });
});

app.get('/workspaces/:id/settings', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    assertCanReadWorkspaceSettings(workspaceId, (req as any).user.userId);
    res.json({ settings: getWorkspaceSettingsForApi(workspaceId) });
  } catch (error) {
    sendError(res, error, 'Failed to load workspace settings');
  }
});

app.patch('/workspaces/:id/settings', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    res.json({ settings: updateWorkspaceSettings(workspaceId, (req as any).user.userId, req.body ?? {}) });
  } catch (error) {
    sendError(res, error, 'Failed to update workspace settings');
  }
});

app.get('/workspaces/:id/members', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    res.json({ members: listWorkspaceMembers(workspaceId, (req as any).user.userId) });
  } catch (error) {
    sendError(res, error, 'Failed to load workspace members');
  }
});

app.post('/workspaces/:id/members', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    res.status(201).json({ members: addWorkspaceMember(workspaceId, (req as any).user.userId, req.body ?? {}) });
  } catch (error) {
    sendError(res, error, 'Failed to add workspace member');
  }
});

app.patch('/workspaces/:id/members/:userId', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    res.json({ members: updateWorkspaceMemberRole(workspaceId, (req as any).user.userId, targetUserId, req.body ?? {}) });
  } catch (error) {
    sendError(res, error, 'Failed to update workspace member');
  }
});

app.delete('/workspaces/:id/members/:userId', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    res.json({ members: removeWorkspaceMember(workspaceId, (req as any).user.userId, targetUserId) });
  } catch (error) {
    sendError(res, error, 'Failed to remove workspace member');
  }
});

app.get('/workspaces/:id/invites', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    res.json({ invites: listWorkspaceInvites(workspaceId, (req as any).user.userId) });
  } catch (error) {
    sendError(res, error, 'Failed to load workspace invites');
  }
});

app.post('/workspaces/:id/invites', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    res.status(201).json({ invite: createWorkspaceInvite(workspaceId, (req as any).user.userId, req.body ?? {}) });
  } catch (error) {
    sendError(res, error, 'Failed to create workspace invite');
  }
});

app.delete('/workspaces/:id/invites/:inviteId', auth, (req, res) => {
  try {
    const workspaceId = Number(req.params.id);
    const inviteId = Number(req.params.inviteId);
    res.json({ invites: revokeWorkspaceInvite(workspaceId, (req as any).user.userId, inviteId) });
  } catch (error) {
    sendError(res, error, 'Failed to revoke workspace invite');
  }
});

app.get('/history/:id', auth, (req, res) => {
  const includeDebug = req.query.debug === '1';
  const item = getHistoryDetail(Number(req.params.id), (req as any).user.userId, includeDebug, (req as any).user.workspaceId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.post('/mailboxes/create', auth, async (req, res) => {
  const settings = getWorkspaceSettings((req as any).user.workspaceId);
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    reserveMailboxCreation((req as any).user.workspaceId, (req as any).user.userId, settings);
    const mailbox = await getEmailProvider(resolveMailboxProvider(req.body?.mailboxProvider, settings.mailbox_provider)).createAccount();
    res.json(mailbox);
  } catch (error) {
    sendError(res, error, 'Failed to create mailbox');
  }
});

app.get('/mailboxes/health', auth, async (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    const provider = getEmailProvider(getWorkspaceSettings((req as any).user.workspaceId).mailbox_provider);
    if (!provider.checkHealth) {
      return res.json({ ok: true, provider: 'mail_tm', message: 'Health check is not implemented for this provider' });
    }
    res.json(await provider.checkHealth());
  } catch (error) {
    sendError(res, error, 'Mailbox provider health check failed');
  }
});

app.post('/mailboxes/inbox', auth, async (req, res) => {
  const settings = getWorkspaceSettings((req as any).user.workspaceId);
  const address = String(req.body?.address ?? '').trim();
  const password = String(req.body?.password ?? '');
  const waitMs = Math.min(60000, Math.max(0, Number(req.body?.waitMs ?? 0)));
  if (!address || !password) {
    return res.status(400).json({ error: 'Mailbox address and password are required' });
  }
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    reserveInboxRefresh((req as any).user.workspaceId, (req as any).user.userId, settings);
    const provider = getMailboxReadProvider(req.body?.provider ?? req.body?.mailboxProvider ?? preciseMailboxProviderOrUndefined(settings.mailbox_provider));
    const inbox = await provider.fetchInbox(address, password, waitMs);
    res.json(buildInboxPayload(inbox));
  } catch (error) {
    sendError(res, error, 'Failed to fetch mailbox inbox');
  }
});

app.post('/history/:id/refresh-inbox', auth, async (req, res) => {
  const settings = getWorkspaceSettings((req as any).user.workspaceId);
  const waitMs = Math.min(60000, Math.max(0, Number(req.body?.waitMs ?? 0)));
  const includeDebug = req.query.debug === '1';
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    const historyId = Number(req.params.id);
    const mailboxProvider = getRefreshMailboxProviderKey(historyId, (req as any).user.userId, (req as any).user.workspaceId);
    if (!mailboxProvider) return res.status(404).json({ error: 'Not found' });
    reserveInboxRefresh((req as any).user.workspaceId, (req as any).user.userId, settings);
    const item = await refreshInbox(historyId, (req as any).user.userId, getMailboxReadProvider(mailboxProvider), waitMs, includeDebug, (req as any).user.workspaceId);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to refresh inbox');
  }
});

app.post('/history/:id/replace-mailbox', auth, async (req, res) => {
  const settings = getWorkspaceSettings((req as any).user.workspaceId);
  const includeDebug = req.query.debug === '1';
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    const providerKey = resolveMailboxProvider(req.body?.mailboxProvider, settings.mailbox_provider);
    const item = await replaceMailbox({
      id: Number(req.params.id),
      userId: (req as any).user.userId,
      emailProvider: getEmailProvider(providerKey),
      emailProviderForAccount: getMailboxReadProvider,
      reserveMailboxCreation: () => reserveMailboxCreation((req as any).user.workspaceId, (req as any).user.userId, settings),
      includeDebug,
      workspaceId: (req as any).user.workspaceId,
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to replace mailbox');
  }
});

app.patch('/history/:id/account-id', auth, (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
  } catch (error) {
    return sendError(res, error, 'Workspace permission denied');
  }
  const includeDebug = req.query.debug === '1';
  const item = updateSiteAccountId(Number(req.params.id), (req as any).user.userId, String(req.body?.siteAccountId ?? ''), includeDebug, (req as any).user.workspaceId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.patch('/history/:id/balance-status', auth, (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
  } catch (error) {
    return sendError(res, error, 'Workspace permission denied');
  }
  const includeDebug = req.query.debug === '1';
  const item = updateAccountBalanceStatus(Number(req.params.id), (req as any).user.userId, String(req.body?.balanceStatus ?? 'unknown'), includeDebug, (req as any).user.workspaceId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.patch('/history/:id/phone', auth, (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    const includeDebug = req.query.debug === '1';
    const item = updatePhone(Number(req.params.id), (req as any).user.userId, String(req.body?.phone ?? ''), includeDebug, (req as any).user.workspaceId);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to save phone');
  }
});

app.patch('/history/:id/sharing', auth, (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
  } catch (error) {
    return sendError(res, error, 'Workspace permission denied');
  }
  const includeDebug = req.query.debug === '1';
  const item = updateHistorySharing(Number(req.params.id), (req as any).user.userId, Boolean(req.body?.sharedWithWorkspace), includeDebug, (req as any).user.workspaceId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.post('/history/:id/regenerate-phone', auth, (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
  } catch (error) {
    return sendError(res, error, 'Workspace permission denied');
  }
  const includeDebug = req.query.debug === '1';
  const item = regeneratePhone(Number(req.params.id), (req as any).user.userId, includeDebug, (req as any).user.workspaceId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.delete('/history/:id', auth, (req, res) => {
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
  } catch (error) {
    return sendError(res, error, 'Workspace permission denied');
  }
  deleteHistory(Number(req.params.id), (req as any).user.userId, (req as any).user.workspaceId);
  res.status(204).send();
});

app.post('/accounts/generate', auth, async (req, res) => {
  const { geoKey, documentType, role, persona } = req.body ?? {};
  const settings = getWorkspaceSettings((req as any).user.workspaceId);
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    reserveGenerationUsage((req as any).user.workspaceId, (req as any).user.userId, settings, 1);
    const item = await generateAccount({
      userId: (req as any).user.userId,
      workspaceId: (req as any).user.workspaceId,
      geoKey,
      documentType,
      role: role === 'admin' ? 'admin' : 'user',
      persona: isPersona(persona) ? persona : 'standard_user',
      emailProvider: getEmailProvider(resolveMailboxProvider(req.body?.mailboxProvider, settings.mailbox_provider)),
      emailProviderForAccount: getMailboxReadProvider,
      includeDebug: req.query.debug === '1',
    });
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to generate account');
  }
});

app.post('/accounts/generate-bulk', auth, async (req, res) => {
  const { geoKey, documentType, role, persona } = req.body ?? {};
  const settings = getWorkspaceSettings((req as any).user.workspaceId);
  const requestedCount = Number(req.body?.count ?? 1);
  const maxBulkCount = Math.max(1, Math.min(100, Number(settings.max_bulk_count ?? 25)));
  const count = Number.isFinite(requestedCount) ? Math.min(maxBulkCount, Math.max(1, Math.floor(requestedCount))) : 1;
  try {
    requireWorkspacePermission(req, ['owner', 'admin', 'member']);
    if (!settings.allow_bulk_generation) {
      throw new ApiError('bulk_generation_disabled', 'Bulk generation is disabled for this workspace', 403);
    }
    reserveGenerationUsage((req as any).user.workspaceId, (req as any).user.userId, settings, count);
    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push(await generateAccount({
        userId: (req as any).user.userId,
        workspaceId: (req as any).user.workspaceId,
        geoKey,
        documentType,
        role: role === 'admin' ? 'admin' : 'user',
        persona: isPersona(persona) ? persona : 'standard_user',
        emailProvider: getEmailProvider(resolveMailboxProvider(req.body?.mailboxProvider, settings.mailbox_provider)),
        emailProviderForAccount: getMailboxReadProvider,
        includeDebug: false,
      }));
    }
    res.json({ items });
  } catch (error) {
    sendError(res, error, 'Failed to generate accounts');
  }
});

if (process.env.NODE_ENV !== 'test') {
  startRetentionCleanupSchedule();
  app.listen(port, () => console.log(`backend listening on ${port}`));
}

export default app;

function isPersona(value: unknown): value is PersonaKey {
  return ['standard_user', 'young_user', 'senior_user', 'male_user', 'female_user'].includes(String(value));
}

function createSession(userId: number, req: express.Request) {
  const token = newSessionToken();
  const expiresAt = addDays(new Date(), Number.isFinite(sessionDays) ? sessionDays : 30);
  const result = db.prepare(`
    INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    userId,
    hashSessionToken(token),
    String(req.headers['user-agent'] ?? '').slice(0, 240),
    String(req.ip ?? '').slice(0, 80),
    expiresAt.toISOString(),
  );
  return { id: Number(result.lastInsertRowid), token, expiresAt };
}

function rotateSession(sessionId: number, userId: number, req: express.Request) {
  const token = newSessionToken();
  const expiresAt = addDays(new Date(), Number.isFinite(sessionDays) ? sessionDays : 30);
  db.prepare(`
    UPDATE sessions
    SET token_hash = ?, user_agent = ?, ip_address = ?, expires_at = ?, last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).run(
    hashSessionToken(token),
    String(req.headers['user-agent'] ?? '').slice(0, 240),
    requestIp(req),
    expiresAt.toISOString(),
    sessionId,
    userId,
  );
  return { id: sessionId, token, expiresAt };
}

function buildAuthResponse(user: { id: number; login: string; role: Role; email?: string; username?: string; status?: string }, sessionId: number, preferredWorkspaceId?: number) {
  const workspaceId = preferredWorkspaceId ?? getDefaultWorkspaceForUser(user.id);
  const workspaceRole = getWorkspaceRole(user.id, workspaceId);
  if (!workspaceRole) {
    throw new ApiError('workspace_access_denied', 'Workspace access denied', 403);
  }
  const token = jwt.sign(
    { userId: user.id, login: user.login, role: user.role, sessionId, workspaceId },
    jwtSecret,
    { expiresIn: accessTokenTtl, issuer: jwtIssuer, audience: jwtAudience, algorithm: 'HS256' },
  );
  return {
    token,
    user: {
      id: user.id,
      login: user.login,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      workspaceId,
      workspaceRole,
    },
  };
}

function isSessionActive(sessionId: number, userId: number) {
  const session = db.prepare(`
    SELECT id
    FROM sessions
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(sessionId, userId);
  return Boolean(session);
}

function accountSessionCookieName(userId: number) {
  return `${accountSessionCookiePrefix}${userId}`;
}

function setCookie(res: express.Response, name: string, token: string, expiresAt: Date) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    expires: expiresAt,
    path: '/',
  });
}

function clearCookie(res: express.Response, name: string) {
  res.clearCookie(name, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}

function setActiveSessionCookie(res: express.Response, token: string, expiresAt: Date) {
  setCookie(res, sessionCookieName, token, expiresAt);
}

function setAccountSessionCookie(res: express.Response, userId: number, token: string, expiresAt: Date) {
  setCookie(res, accountSessionCookieName(userId), token, expiresAt);
}

function clearActiveSessionCookie(res: express.Response) {
  clearCookie(res, sessionCookieName);
}

function clearAccountSessionCookie(res: express.Response, userId: number) {
  clearCookie(res, accountSessionCookieName(userId));
}

function readCookie(req: express.Request, name: string) {
  const raw = req.headers.cookie ?? '';
  const match = raw.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function normalizeUsername(value: unknown) {
  const username = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return username.length >= 3 ? username : '';
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase();
  return email && email.includes('@') ? email : '';
}

function reserveGenerationUsage(workspaceId: number, userId: number, settings: ReturnType<typeof getWorkspaceSettings>, quantity: number) {
  reserveUsageBatch(workspaceId, userId, [
    {
      eventType: USAGE_EVENTS.accountGenerated,
      limit: settings.accounts_per_day,
      window: '-1 day',
      code: 'generation_limit_reached',
      message: 'Daily account generation limit reached',
      quantity,
    },
    {
      eventType: USAGE_EVENTS.mailboxCreated,
      limit: settings.mailbox_create_per_day,
      window: '-1 day',
      code: 'mailbox_limit_reached',
      message: 'Daily mailbox creation limit reached',
      quantity,
    },
  ]);
}

function reserveMailboxCreation(workspaceId: number, userId: number, settings: ReturnType<typeof getWorkspaceSettings>) {
  reserveUsage(workspaceId, userId, {
    eventType: USAGE_EVENTS.mailboxCreated,
    limit: settings.mailbox_create_per_day,
    window: '-1 day',
    code: 'mailbox_limit_reached',
    message: 'Daily mailbox creation limit reached',
  });
}

function reserveInboxRefresh(workspaceId: number, userId: number, settings: ReturnType<typeof getWorkspaceSettings>) {
  reserveUsage(workspaceId, userId, {
    eventType: USAGE_EVENTS.inboxRefreshed,
    limit: settings.inbox_refresh_per_minute,
    window: '-1 minute',
    code: 'inbox_refresh_limit_reached',
    message: 'Inbox refresh limit reached',
  });
}

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (isProduction) {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'dev-secret';
}

function parseAllowedOrigins() {
  return new Set(
    String(process.env.CORS_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function requestIp(req: express.Request) {
  const forwardedFor = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  const ip = String(req.headers['cf-connecting-ip'] ?? req.headers['x-real-ip'] ?? forwardedFor ?? req.ip ?? '');
  return ip.slice(0, 80);
}

function recordAuthEvent(login: string, ipAddress: string, success: boolean, failureReason = '') {
  db.prepare(`
    INSERT INTO auth_events (login, ip_address, success, failure_reason)
    VALUES (?, ?, ?, ?)
  `).run(login.trim().toLowerCase().slice(0, 160), ipAddress.slice(0, 80), success ? 1 : 0, failureReason.slice(0, 80));
}

function startRetentionCleanupSchedule() {
  const intervalMs = Math.max(60_000, Number(process.env.RETENTION_CLEANUP_INTERVAL_MS ?? 6 * 60 * 60 * 1000));
  const runCleanup = () => {
    try {
      const deleted = cleanupOldHistory();
      if (deleted > 0) {
        console.log(`retention cleanup removed ${deleted} history rows`);
      }
    } catch (error) {
      console.error('retention cleanup failed', error);
    }
  };
  runCleanup();
  setInterval(runCleanup, intervalMs).unref();
}

function resolveCorsOrigin(origin: string | undefined, callback: (error: Error | null, allow?: boolean | string) => void) {
  if (!isProduction) {
    callback(null, true);
    return;
  }
  if (!origin) {
    callback(null, true);
    return;
  }
  const allowedOrigins = parseAllowedOrigins();
  callback(null, allowedOrigins.has(origin) ? origin : false);
}

function resolvePreferredWorkspaceId(userId: number, candidate: unknown) {
  const workspaceId = Number(candidate);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return undefined;
  }
  return getWorkspaceRole(userId, workspaceId) ? workspaceId : undefined;
}

function sendError(res: express.Response, error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

function requireWorkspacePermission(req: express.Request, allowedRoles: WorkspaceRole[]) {
  return assertWorkspaceRole((req as any).user.userId, (req as any).user.workspaceId, allowedRoles);
}

function getEmailProvider(providerKey: string | undefined): EmailProvider {
  if (providerKey === 'mail_gw') return mailGwProvider;
  if (providerKey === 'mail_tm_mail_gw_fallback') return fallbackEmailProvider;
  return mailTmProvider;
}

function getMailboxReadProvider(providerKey: string | undefined): EmailProvider {
  if (providerKey === 'mail_gw') return mailGwProvider;
  if (providerKey === 'mail_tm') return mailTmProvider;
  throw new ApiError('mailbox_provider_required', 'Mailbox provider is required for inbox refresh', 400);
}

function preciseMailboxProviderOrUndefined(providerKey: string | undefined) {
  return providerKey === 'mail_tm' || providerKey === 'mail_gw' ? providerKey : undefined;
}

function resolveMailboxProvider(candidate: unknown, fallback: string | undefined) {
  const value = typeof candidate === 'string' ? candidate : fallback;
  return ['mail_tm', 'mail_gw', 'mail_tm_mail_gw_fallback'].includes(String(value)) ? String(value) : 'mail_tm';
}
