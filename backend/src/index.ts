import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { MailTmProvider } from './providers/mailTmProvider.js';
import { buildInboxPayload, deleteHistory, generateAccount, getHistoryDetail, listGeoRules, listHistory, refreshInbox, regeneratePhone, updateAccountBalanceStatus, updateHistorySharing, updateSiteAccountId } from './services/accountService.js';
import type { PersonaKey, Role } from './types.js';
import db, { getDefaultWorkspaceForUser } from './db.js';
import { addDays, hashPassword, hashSessionToken, newSessionToken, verifyPassword } from './auth.js';
import { ApiError, enforceDailyLimit, enforceMinuteLimit, getUsageSummary, getWorkspaceSettings, recordUsageEvent, USAGE_EVENTS } from './limits.js';
import { assertCanReadWorkspaceSettings, getUserSettings, getWorkspaceSettingsForApi, updateUserSettings, updateWorkspaceSettings } from './settings.js';
import { assertWorkspaceRole, getWorkspaceRole, type WorkspaceRole } from './permissions.js';
import { addWorkspaceMember, listWorkspaceMembers, removeWorkspaceMember, updateWorkspaceMemberRole } from './workspaceMembers.js';
import { createWorkspaceInvite, getPublicInvite, listWorkspaceInvites, registerUserWithInvite, revokeWorkspaceInvite } from './invitations.js';
import { getWorkspaceAlerts, getWorkspaceAnalytics } from './monitoring.js';
import { createWorkspace, getWorkspaceForUser, listWorkspaces } from './workspaces.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = resolveJwtSecret();
const accessTokenTtl = (process.env.ACCESS_TOKEN_TTL ?? '30m') as SignOptions['expiresIn'];
const sessionDays = Number(process.env.SESSION_DAYS ?? 30);
const registrationMode = process.env.REGISTRATION_MODE ?? 'disabled';
const emailProvider = new MailTmProvider();
const sessionCookieName = 'tag_session';

app.use(cors({ credentials: true, origin: resolveCorsOrigin }));
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: number; login: string; role: Role; sessionId?: number; workspaceId?: number };
    const user = db.prepare('SELECT id, login, role, status FROM users WHERE id = ? OR login = ? LIMIT 1').get(decoded.userId, decoded.login) as { id: number; login: string; role: Role; status: string } | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'User is not active' });
    }
    if (decoded.sessionId && !isSessionActive(decoded.sessionId, user.id)) {
      return res.status(401).json({ error: 'Session expired' });
    }
    const workspaceId = decoded.workspaceId ?? getDefaultWorkspaceForUser(user.id);
    const workspaceRole = getWorkspaceRole(user.id, workspaceId);
    if (!workspaceRole) {
      return res.status(403).json({ error: 'Workspace access denied', code: 'workspace_access_denied' });
    }
    (req as any).user = { userId: user.id, login: user.login, role: user.role, workspaceRole, sessionId: decoded.sessionId ?? null, workspaceId };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/login', (req, res) => {
  const login = String(req.body?.login ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = db.prepare('SELECT id, login, password, password_hash, role, email, username, status FROM users WHERE login = ? OR email = ? OR username = ? LIMIT 1').get(login, login, login) as any;
  if (!user || !verifyPassword(password, user.password_hash, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'User is not active' });
  }
  if (!user.password_hash) {
    db.prepare('UPDATE users SET password_hash = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashPassword(password), '', user.id);
  }
  const session = createSession(user.id, req);
  setSessionCookie(res, session.token, session.expiresAt);
  res.json(buildAuthResponse(user, session.id));
});

app.post('/auth/register', (req, res) => {
  if (registrationMode === 'disabled') {
    return res.status(403).json({ error: 'Registration is disabled', code: 'registration_disabled' });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password ?? '');
  if (!email || !email.includes('@') || !username || password.length < 8) {
    return res.status(400).json({ error: 'Valid email, username, and 8+ character password are required', code: 'invalid_registration_payload' });
  }

  try {
    if (registrationMode === 'invite_only') {
      const inviteToken = String(req.body?.inviteToken ?? '').trim();
      if (!inviteToken) {
        return res.status(403).json({ error: 'Invite token is required', code: 'invite_required' });
      }
      const user = registerUserWithInvite({ inviteToken, email, username, passwordHash: hashPassword(password) });
      const session = createSession(user.id, req);
      setSessionCookie(res, session.token, session.expiresAt);
      return res.status(201).json(buildAuthResponse(user, session.id));
    }

    const result = db.prepare(`
      INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
      VALUES (?, '', ?, 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
    `).run(username, hashPassword(password), email, username);
    const userId = Number(result.lastInsertRowid);
    getDefaultWorkspaceForUser(userId);
    const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get(userId) as any;
    const session = createSession(user.id, req);
    setSessionCookie(res, session.token, session.expiresAt);
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
  const sessionToken = readCookie(req, sessionCookieName);
  if (!sessionToken) return res.status(401).json({ error: 'No active session' });

  const session = db.prepare(`
    SELECT id, user_id
    FROM sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(hashSessionToken(sessionToken)) as { id: number; user_id: number } | undefined;
  if (!session) return res.status(401).json({ error: 'Session expired' });

  db.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(session.id);
  const user = db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get(session.user_id) as any;
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Unauthorized' });
  const preferredWorkspaceId = resolvePreferredWorkspaceId(user.id, req.body?.workspaceId);
  res.json(buildAuthResponse(user, session.id, preferredWorkspaceId));
});

app.post('/auth/logout', auth, (req, res) => {
  if ((req as any).user.sessionId) {
    db.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run((req as any).user.sessionId, (req as any).user.userId);
  }
  clearSessionCookie(res);
  res.status(204).send();
});

app.post('/auth/logout-everywhere', auth, (req, res) => {
  db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND revoked_at IS NULL
  `).run((req as any).user.userId);
  clearSessionCookie(res);
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
  db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(sessionId, (req as any).user.userId);
  if (sessionId === (req as any).user.sessionId) {
    clearSessionCookie(res);
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

app.patch('/auth/password', auth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '');
  const nextPassword = String(req.body?.newPassword ?? '');
  if (nextPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters', code: 'invalid_password_payload' });
  }
  const user = db.prepare('SELECT id, password, password_hash FROM users WHERE id = ?').get((req as any).user.userId) as any;
  if (!user || !verifyPassword(currentPassword, user.password_hash, user.password)) {
    return res.status(403).json({ error: 'Current password is incorrect', code: 'current_password_invalid' });
  }
  db.prepare(`
    UPDATE users
    SET password_hash = ?, password = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashPassword(nextPassword), (req as any).user.userId);
  db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND id != ? AND revoked_at IS NULL
  `).run((req as any).user.userId, (req as any).user.sessionId ?? 0);
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
    const workspace = createWorkspace((req as any).user.userId, req.body ?? {});
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

app.get('/limits', auth, (req, res) => {
  res.json(getUsageSummary((req as any).user.workspaceId, (req as any).user.userId));
});

app.get('/alerts', auth, (req, res) => {
  res.json({ items: getWorkspaceAlerts((req as any).user.workspaceId, (req as any).user.userId) });
});

app.get('/analytics/summary', auth, (req, res) => {
  res.json({ summary: getWorkspaceAnalytics((req as any).user.workspaceId, (req as any).user.userId) });
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
    enforceDailyLimit(
      (req as any).user.workspaceId,
      (req as any).user.userId,
      USAGE_EVENTS.mailboxCreated,
      settings.mailbox_create_per_day,
      'mailbox_limit_reached',
      'Daily mailbox creation limit reached',
    );
    const mailbox = await emailProvider.createAccount();
    recordUsageEvent((req as any).user.workspaceId, (req as any).user.userId, USAGE_EVENTS.mailboxCreated);
    res.json(mailbox);
  } catch (error) {
    sendError(res, error, 'Failed to create mailbox');
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
    enforceMinuteLimit(
      (req as any).user.workspaceId,
      (req as any).user.userId,
      USAGE_EVENTS.inboxRefreshed,
      settings.inbox_refresh_per_minute,
      'inbox_refresh_limit_reached',
      'Inbox refresh limit reached',
    );
    const inbox = await emailProvider.fetchInbox(address, password, waitMs);
    recordUsageEvent((req as any).user.workspaceId, (req as any).user.userId, USAGE_EVENTS.inboxRefreshed);
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
    enforceMinuteLimit(
      (req as any).user.workspaceId,
      (req as any).user.userId,
      USAGE_EVENTS.inboxRefreshed,
      settings.inbox_refresh_per_minute,
      'inbox_refresh_limit_reached',
      'Inbox refresh limit reached',
    );
    const item = await refreshInbox(Number(req.params.id), (req as any).user.userId, emailProvider, waitMs, includeDebug, (req as any).user.workspaceId);
    if (!item) return res.status(404).json({ error: 'Not found' });
    recordUsageEvent((req as any).user.workspaceId, (req as any).user.userId, USAGE_EVENTS.inboxRefreshed);
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to refresh inbox');
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
    enforceGenerationLimits((req as any).user.workspaceId, (req as any).user.userId, settings, 1);
    const item = await generateAccount({
      userId: (req as any).user.userId,
      workspaceId: (req as any).user.workspaceId,
      geoKey,
      documentType,
      role: role === 'admin' ? 'admin' : 'user',
      persona: isPersona(persona) ? persona : 'standard_user',
      emailProvider,
      includeDebug: req.query.debug === '1',
    });
    recordGenerationUsage((req as any).user.workspaceId, (req as any).user.userId, 1);
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
    enforceGenerationLimits((req as any).user.workspaceId, (req as any).user.userId, settings, count);
    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push(await generateAccount({
        userId: (req as any).user.userId,
        workspaceId: (req as any).user.workspaceId,
        geoKey,
        documentType,
        role: role === 'admin' ? 'admin' : 'user',
        persona: isPersona(persona) ? persona : 'standard_user',
        emailProvider,
        includeDebug: false,
      }));
    }
    recordGenerationUsage((req as any).user.workspaceId, (req as any).user.userId, count);
    res.json({ items });
  } catch (error) {
    sendError(res, error, 'Failed to generate accounts');
  }
});

if (process.env.NODE_ENV !== 'test') {
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

function buildAuthResponse(user: { id: number; login: string; role: Role; email?: string; username?: string; status?: string }, sessionId: number, preferredWorkspaceId?: number) {
  const workspaceId = preferredWorkspaceId ?? getDefaultWorkspaceForUser(user.id);
  const workspaceRole = getWorkspaceRole(user.id, workspaceId);
  if (!workspaceRole) {
    throw new ApiError('workspace_access_denied', 'Workspace access denied', 403);
  }
  const token = jwt.sign({ userId: user.id, login: user.login, role: user.role, sessionId, workspaceId }, jwtSecret, { expiresIn: accessTokenTtl });
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

function setSessionCookie(res: express.Response, token: string, expiresAt: Date) {
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
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

function enforceGenerationLimits(workspaceId: number, userId: number, settings: ReturnType<typeof getWorkspaceSettings>, quantity: number) {
  enforceDailyLimit(
    workspaceId,
    userId,
    USAGE_EVENTS.accountGenerated,
    settings.accounts_per_day,
    'generation_limit_reached',
    'Daily account generation limit reached',
    quantity,
  );
  enforceDailyLimit(
    workspaceId,
    userId,
    USAGE_EVENTS.mailboxCreated,
    settings.mailbox_create_per_day,
    'mailbox_limit_reached',
    'Daily mailbox creation limit reached',
    quantity,
  );
}

function recordGenerationUsage(workspaceId: number, userId: number, quantity: number) {
  recordUsageEvent(workspaceId, userId, USAGE_EVENTS.accountGenerated, quantity);
  recordUsageEvent(workspaceId, userId, USAGE_EVENTS.mailboxCreated, quantity);
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
