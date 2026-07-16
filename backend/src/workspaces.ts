import db, { assertWorkspaceAccess } from './db.js';
import { ApiError } from './limits.js';
import { getWorkspaceRole, type WorkspaceRole } from './permissions.js';

export interface WorkspaceResponse {
  id: number;
  name: string;
  status: 'active' | 'archived';
  ownerUserId: number;
  workspaceRole: WorkspaceRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export function listWorkspaces(userId: number): WorkspaceResponse[] {
  return db.prepare(`
    SELECT w.id,
           w.name,
           w.status,
           w.owner_user_id as ownerUserId,
           wm.role as workspaceRole,
           w.created_at as createdAt,
           w.updated_at as updatedAt,
           (
             SELECT COUNT(*)
             FROM workspace_members members
             WHERE members.workspace_id = w.id
           ) as memberCount
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY
      CASE w.status WHEN 'active' THEN 0 ELSE 1 END,
      CASE WHEN w.owner_user_id = ? THEN 0 ELSE 1 END,
      lower(w.name),
      w.id
  `).all(userId, userId) as WorkspaceResponse[];
}

export function createWorkspace(userId: number, payload: any): WorkspaceResponse {
  const name = normalizeWorkspaceName(payload?.name);
  if (!name) {
    throw new ApiError('workspace_name_required', 'Workspace name is required', 400);
  }

  const user = db.prepare(`
    SELECT status
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as { status: string } | undefined;
  if (!user || user.status !== 'active') {
    throw new ApiError('workspace_create_forbidden', 'Only active users can create workspaces', 403);
  }

  const workspaceId = Number(db.prepare(`
    INSERT INTO workspaces (owner_user_id, name, status)
    VALUES (?, ?, 'active')
  `).run(userId, name).lastInsertRowid);

  db.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (?, ?, 'owner')
  `).run(workspaceId, userId);

  db.prepare(`
    INSERT OR IGNORE INTO workspace_settings (workspace_id)
    VALUES (?)
  `).run(workspaceId);

  return getWorkspaceForUser(userId, workspaceId);
}

export function getWorkspaceForUser(userId: number, workspaceId: number): WorkspaceResponse {
  assertWorkspaceAccess(userId, workspaceId);
  const row = listWorkspaces(userId).find((workspace) => workspace.id === workspaceId);
  if (!row) {
    throw new ApiError('workspace_not_found', 'Workspace not found', 404);
  }
  return row;
}

export function updateWorkspaceStatus(userId: number, workspaceId: number, payload: any): WorkspaceResponse {
  const status = normalizeWorkspaceStatus(payload?.status);
  const workspace = db.prepare(`
    SELECT w.id,
           w.status,
           wm.role as workspaceRole
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.workspace_id = ?
    LIMIT 1
  `).get(userId, workspaceId) as { id: number; status: 'active' | 'archived'; workspaceRole: WorkspaceRole } | undefined;

  if (!workspace) {
    throw new ApiError('workspace_not_found', 'Workspace not found', 404);
  }
  if (workspace.workspaceRole !== 'owner') {
    throw new ApiError('workspace_owner_required', 'Only workspace owners can archive or restore workspaces', 403);
  }
  if (workspace.status === status) {
    return listWorkspaces(userId).find((item) => item.id === workspaceId) ?? getWorkspaceForUser(userId, workspaceId);
  }
  if (status === 'archived') {
    const activeCount = db.prepare(`
      SELECT COUNT(*) as total
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ? AND w.status = 'active'
    `).get(userId) as { total: number };
    if (Number(activeCount.total) <= 1) {
      throw new ApiError('last_active_workspace_required', 'At least one active workspace is required', 400);
    }
  }

  db.prepare(`
    UPDATE workspaces
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, workspaceId);

  const updated = listWorkspaces(userId).find((item) => item.id === workspaceId);
  if (!updated) {
    throw new ApiError('workspace_not_found', 'Workspace not found', 404);
  }
  return updated;
}

export function assertActiveWorkspaceRole(userId: number, workspaceId: number) {
  assertWorkspaceAccess(userId, workspaceId);
  const role = getWorkspaceRole(userId, workspaceId);
  if (!role) {
    throw new ApiError('workspace_access_denied', 'Workspace access denied', 403);
  }
  return role;
}

function normalizeWorkspaceName(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeWorkspaceStatus(value: unknown): 'active' | 'archived' {
  if (value === 'active' || value === 'archived') return value;
  throw new ApiError('invalid_workspace_status', 'Workspace status must be active or archived', 400);
}
