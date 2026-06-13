import db from './db.js';
import { ApiError } from './limits.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export function getWorkspaceRole(userId: number, workspaceId: number): WorkspaceRole | null {
  const row = db.prepare(`
    SELECT role
    FROM workspace_members
    WHERE user_id = ? AND workspace_id = ?
    LIMIT 1
  `).get(userId, workspaceId) as { role: WorkspaceRole } | undefined;
  return row?.role ?? null;
}

export function assertWorkspaceRole(userId: number, workspaceId: number, allowedRoles: WorkspaceRole[], code = 'workspace_permission_denied', message = 'Workspace permission denied') {
  const role = getWorkspaceRole(userId, workspaceId);
  if (!role) {
    throw new ApiError('workspace_access_denied', 'Workspace access denied', 403);
  }
  if (!allowedRoles.includes(role)) {
    throw new ApiError(code, message, 403);
  }
  return role;
}
