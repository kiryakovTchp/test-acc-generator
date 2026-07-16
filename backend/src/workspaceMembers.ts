import db from './db.js';
import { ApiError } from './limits.js';
import { assertWorkspaceRole, type WorkspaceRole } from './permissions.js';
import { recordActivity } from './activity.js';

const WORKSPACE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer'];

export interface WorkspaceMemberResponse {
  userId: number;
  login: string;
  email: string;
  username: string;
  userRole: string;
  workspaceRole: WorkspaceRole;
  joinedAt: string;
}

export function listWorkspaceMembers(workspaceId: number, userId: number) {
  assertWorkspaceRole(userId, workspaceId, WORKSPACE_ROLES);
  return db.prepare(`
    SELECT u.id as userId,
           u.login,
           COALESCE(u.email, '') as email,
           COALESCE(u.username, '') as username,
           u.role as userRole,
           wm.role as workspaceRole,
           wm.created_at as joinedAt
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY
      CASE wm.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'member' THEN 2
        ELSE 3
      END,
      lower(u.login)
  `).all(workspaceId) as WorkspaceMemberResponse[];
}

export function addWorkspaceMember(workspaceId: number, actorUserId: number, payload: any) {
  assertCanManageMembers(workspaceId, actorUserId);
  const role = normalizeWorkspaceRole(payload?.role, 'member');
  const lookup = String(payload?.login ?? payload?.email ?? payload?.username ?? '').trim();
  if (!lookup) {
    throw new ApiError('member_lookup_required', 'User login, email, or username is required', 400);
  }

  const user = db.prepare(`
    SELECT id
    FROM users
    WHERE login = ? OR email = ? OR username = ?
    LIMIT 1
  `).get(lookup, lookup, lookup) as { id: number } | undefined;
  if (!user) {
    throw new ApiError('user_not_found', 'User not found', 404);
  }

  try {
    db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(workspaceId, user.id, role);
  } catch {
    throw new ApiError('workspace_member_exists', 'User is already a member of this workspace', 409);
  }

  db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(user.id);
  recordActivity({
    workspaceId,
    userId: actorUserId,
    eventType: 'member_added',
    entityType: 'user',
    entityId: user.id,
    summary: `Added ${lookup} as ${role}`,
    metadata: { targetUserId: user.id, role },
  });
  return listWorkspaceMembers(workspaceId, actorUserId);
}

export function updateWorkspaceMemberRole(workspaceId: number, actorUserId: number, targetUserId: number, payload: any) {
  assertCanManageMembers(workspaceId, actorUserId);
  const role = normalizeWorkspaceRole(payload?.role, 'member');
  assertMemberExists(workspaceId, targetUserId);
  if (role !== 'owner') {
    assertNotLastOwner(workspaceId, targetUserId);
  }

  db.prepare(`
    UPDATE workspace_members
    SET role = ?
    WHERE workspace_id = ? AND user_id = ?
  `).run(role, workspaceId, targetUserId);

  recordActivity({
    workspaceId,
    userId: actorUserId,
    eventType: 'member_role_changed',
    entityType: 'user',
    entityId: targetUserId,
    summary: `Changed member role to ${role}`,
    metadata: { targetUserId, role },
  });
  return listWorkspaceMembers(workspaceId, actorUserId);
}

export function removeWorkspaceMember(workspaceId: number, actorUserId: number, targetUserId: number) {
  assertCanManageMembers(workspaceId, actorUserId);
  assertMemberExists(workspaceId, targetUserId);
  assertNotLastOwner(workspaceId, targetUserId);

  db.prepare(`
    DELETE FROM workspace_members
    WHERE workspace_id = ? AND user_id = ?
  `).run(workspaceId, targetUserId);

  recordActivity({
    workspaceId,
    userId: actorUserId,
    eventType: 'member_removed',
    entityType: 'user',
    entityId: targetUserId,
    summary: 'Removed workspace member',
    metadata: { targetUserId },
  });
  return listWorkspaceMembers(workspaceId, actorUserId);
}

function assertCanManageMembers(workspaceId: number, userId: number) {
  assertWorkspaceRole(userId, workspaceId, ['owner', 'admin'], 'workspace_members_forbidden', 'Workspace members require owner or admin access');
}

function assertMemberExists(workspaceId: number, userId: number) {
  const row = db.prepare(`
    SELECT user_id
    FROM workspace_members
    WHERE workspace_id = ? AND user_id = ?
    LIMIT 1
  `).get(workspaceId, userId);
  if (!row) {
    throw new ApiError('workspace_member_not_found', 'Workspace member not found', 404);
  }
}

function assertNotLastOwner(workspaceId: number, userId: number) {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN role = 'owner' THEN 1 ELSE 0 END) as ownerCount,
      MAX(CASE WHEN user_id = ? THEN role ELSE NULL END) as targetRole
    FROM workspace_members
    WHERE workspace_id = ?
  `).get(userId, workspaceId) as { ownerCount: number; targetRole: WorkspaceRole | null };

  if (row.targetRole === 'owner' && row.ownerCount <= 1) {
    throw new ApiError('last_owner_required', 'Workspace must keep at least one owner', 400);
  }
}

function normalizeWorkspaceRole(value: unknown, fallback: WorkspaceRole): WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole) ? value as WorkspaceRole : fallback;
}
