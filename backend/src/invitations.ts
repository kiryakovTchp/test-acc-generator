import { createHash, randomBytes } from 'node:crypto';
import db from './db.js';
import { ApiError } from './limits.js';
import { assertWorkspaceRole, type WorkspaceRole } from './permissions.js';

type InviteRole = Extract<WorkspaceRole, 'admin' | 'member' | 'viewer'>;

const INVITE_ROLES: InviteRole[] = ['admin', 'member', 'viewer'];
const DEFAULT_EXPIRES_DAYS = 7;
const MAX_EXPIRES_DAYS = 30;

export interface WorkspaceInviteResponse {
  id: number;
  workspaceId: number;
  email: string;
  role: InviteRole;
  status: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string;
  invitedByLogin: string;
  acceptedByLogin: string;
}

export interface PublicInviteResponse {
  email: string;
  role: InviteRole;
  status: string;
  expiresAt: string;
  workspaceName: string;
}

export function listWorkspaceInvites(workspaceId: number, actorUserId: number) {
  assertCanManageInvites(workspaceId, actorUserId);
  expirePendingInvites();
  return db.prepare(`
    SELECT wi.id,
           wi.workspace_id as workspaceId,
           COALESCE(wi.email, '') as email,
           wi.role,
           wi.status,
           wi.expires_at as expiresAt,
           wi.created_at as createdAt,
           COALESCE(wi.accepted_at, '') as acceptedAt,
           inviter.login as invitedByLogin,
           COALESCE(accepted.login, '') as acceptedByLogin
    FROM workspace_invites wi
    JOIN users inviter ON inviter.id = wi.invited_by_user_id
    LEFT JOIN users accepted ON accepted.id = wi.accepted_by_user_id
    WHERE wi.workspace_id = ?
    ORDER BY wi.id DESC
    LIMIT 25
  `).all(workspaceId) as WorkspaceInviteResponse[];
}

export function createWorkspaceInvite(workspaceId: number, actorUserId: number, payload: any) {
  assertCanManageInvites(workspaceId, actorUserId);
  const role = normalizeInviteRole(payload?.role, 'member');
  const email = normalizeEmail(payload?.email);
  const expiresInDays = normalizeExpiresInDays(payload?.expiresInDays);
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare(`
    INSERT INTO workspace_invites (workspace_id, invited_by_user_id, token_hash, email, role, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workspaceId, actorUserId, hashInviteToken(token), email || null, role, expiresAt);

  const invite = db.prepare(`
    SELECT id,
           workspace_id as workspaceId,
           COALESCE(email, '') as email,
           role,
           status,
           expires_at as expiresAt,
           created_at as createdAt,
           '' as acceptedAt,
           '' as invitedByLogin,
           '' as acceptedByLogin
    FROM workspace_invites
    WHERE id = ?
  `).get(Number(result.lastInsertRowid)) as WorkspaceInviteResponse;

  return { ...invite, token };
}

export function revokeWorkspaceInvite(workspaceId: number, actorUserId: number, inviteId: number) {
  assertCanManageInvites(workspaceId, actorUserId);
  const invite = db.prepare(`
    SELECT id, status
    FROM workspace_invites
    WHERE id = ? AND workspace_id = ?
    LIMIT 1
  `).get(inviteId, workspaceId) as { id: number; status: string } | undefined;
  if (!invite) {
    throw new ApiError('workspace_invite_not_found', 'Workspace invite not found', 404);
  }
  if (invite.status !== 'pending') {
    throw new ApiError('workspace_invite_not_pending', 'Only pending invites can be revoked', 400);
  }
  db.prepare(`
    UPDATE workspace_invites
    SET status = 'revoked'
    WHERE id = ?
  `).run(inviteId);
  return listWorkspaceInvites(workspaceId, actorUserId);
}

export function registerUserWithInvite(payload: { inviteToken: string; email: string; username: string; passwordHash: string }) {
  const invite = getPendingInvite(payload.inviteToken);
  if (invite.email && invite.email !== payload.email) {
    throw new ApiError('invite_email_mismatch', 'Invite email does not match registration email', 403);
  }

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO users (login, password, password_hash, role, email, username, status, updated_at)
      VALUES (?, '', ?, 'user', ?, ?, 'active', CURRENT_TIMESTAMP)
    `).run(payload.username, payload.passwordHash, payload.email, payload.username);
    const userId = Number(result.lastInsertRowid);

    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
    db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(invite.workspaceId, userId, invite.role);
    db.prepare(`
      UPDATE workspace_invites
      SET status = 'accepted',
          accepted_by_user_id = ?,
          accepted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, invite.id);

    return db.prepare('SELECT id, login, role, email, username, status FROM users WHERE id = ?').get(userId) as any;
  })();
}

export function getPublicInvite(token: string): PublicInviteResponse {
  expirePendingInvites();
  const invite = db.prepare(`
    SELECT COALESCE(wi.email, '') as email,
           wi.role,
           wi.status,
           wi.expires_at as expiresAt,
           w.name as workspaceName
    FROM workspace_invites wi
    JOIN workspaces w ON w.id = wi.workspace_id
    WHERE wi.token_hash = ?
    LIMIT 1
  `).get(hashInviteToken(token)) as PublicInviteResponse | undefined;
  if (!invite || invite.status !== 'pending') {
    throw new ApiError('invite_invalid', 'Invite token is invalid or expired', 403);
  }
  return invite;
}

function getPendingInvite(token: string) {
  expirePendingInvites();
  const invite = db.prepare(`
    SELECT id, workspace_id as workspaceId, COALESCE(email, '') as email, role
    FROM workspace_invites
    WHERE token_hash = ?
      AND status = 'pending'
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(hashInviteToken(token)) as { id: number; workspaceId: number; email: string; role: InviteRole } | undefined;
  if (!invite) {
    throw new ApiError('invite_invalid', 'Invite token is invalid or expired', 403);
  }
  return invite;
}

function expirePendingInvites() {
  db.prepare(`
    UPDATE workspace_invites
    SET status = 'expired'
    WHERE status = 'pending' AND datetime(expires_at) <= datetime('now')
  `).run();
}

function assertCanManageInvites(workspaceId: number, userId: number) {
  assertWorkspaceRole(userId, workspaceId, ['owner', 'admin'], 'workspace_invites_forbidden', 'Workspace invites require owner or admin access');
}

function normalizeInviteRole(value: unknown, fallback: InviteRole): InviteRole {
  return INVITE_ROLES.includes(value as InviteRole) ? value as InviteRole : fallback;
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase();
  return email && email.includes('@') ? email : '';
}

function normalizeExpiresInDays(value: unknown) {
  const days = Math.floor(Number(value));
  if (!Number.isFinite(days)) return DEFAULT_EXPIRES_DAYS;
  return Math.min(MAX_EXPIRES_DAYS, Math.max(1, days));
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
