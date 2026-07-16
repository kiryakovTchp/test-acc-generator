import db from './db.js';
import { assertWorkspaceRole } from './permissions.js';

const ACTIVITY_READER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

export interface ActivityEventResponse {
  id: number;
  workspaceId: number;
  userId: number;
  actorLogin: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function recordActivity(input: {
  workspaceId: number;
  userId: number;
  eventType: string;
  entityType?: string;
  entityId?: string | number;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  db.prepare(`
    INSERT INTO activity_events (workspace_id, user_id, event_type, entity_type, entity_id, summary, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.workspaceId,
    input.userId,
    input.eventType,
    input.entityType ?? '',
    input.entityId === undefined ? '' : String(input.entityId),
    input.summary,
    JSON.stringify(input.metadata ?? {}),
  );
}

export function listActivityEvents(workspaceId: number, userId: number, limit = 75): ActivityEventResponse[] {
  assertWorkspaceRole(userId, workspaceId, [...ACTIVITY_READER_ROLES]);
  const boundedLimit = Math.min(150, Math.max(1, Math.floor(limit)));
  const rows = db.prepare(`
    SELECT ae.id,
           ae.workspace_id as workspaceId,
           ae.user_id as userId,
           COALESCE(u.login, '') as actorLogin,
           ae.event_type as eventType,
           ae.entity_type as entityType,
           ae.entity_id as entityId,
           ae.summary,
           ae.metadata_json as metadataJson,
           ae.created_at as createdAt
    FROM activity_events ae
    LEFT JOIN users u ON u.id = ae.user_id
    WHERE ae.workspace_id = ?
    ORDER BY datetime(ae.created_at) DESC, ae.id DESC
    LIMIT ?
  `).all(workspaceId, boundedLimit) as Array<Omit<ActivityEventResponse, 'metadata'> & { metadataJson: string }>;

  return rows.map(({ metadataJson, ...row }) => ({
    ...row,
    metadata: parseMetadata(metadataJson),
  }));
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
