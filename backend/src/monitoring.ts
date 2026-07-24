import db from './db.js';
import { getUsageSummary } from './limits.js';

export interface AlertItem {
  id: string;
  tone: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metric?: string;
}

interface UsageEventRow {
  eventType: string;
  day: string;
  total: number;
}

export function getWorkspaceAlerts(workspaceId: number, userId: number): AlertItem[] {
  const usage = getUsageSummary(workspaceId, userId);
  const alerts: AlertItem[] = [
    ...buildLimitAlerts('accounts', 'Accounts', usage.limits.accountsPerDay.used, usage.limits.accountsPerDay.limit, 'daily generation limit'),
    ...buildLimitAlerts('mailboxes', 'Mailboxes', usage.limits.mailboxesPerDay.used, usage.limits.mailboxesPerDay.limit, 'daily mailbox limit'),
    ...buildLimitAlerts('inbox', 'Inbox refresh', usage.limits.inboxRefreshPerMinute.used, usage.limits.inboxRefreshPerMinute.limit, 'per-minute refresh limit'),
  ];

  const reviewDocuments = db.prepare(`
    SELECT COUNT(*) AS count
    FROM account_history
    WHERE workspace_id = ?
      AND created_by_user_id = ?
      AND document_quality != 'verified'
      AND datetime(created_at) >= datetime('now', '-1 day')
  `).get(workspaceId, userId) as { count: number };

  if (Number(reviewDocuments.count ?? 0) > 0) {
    alerts.push({
      id: 'dataset-review-24h',
      tone: 'info',
      title: `Dataset review: ${reviewDocuments.count} generated ${reviewDocuments.count === 1 ? 'identity' : 'identities'}`,
      message: 'Some document formats are synthetic or missing rules. Select an identity to see its document status.',
      metric: 'Docs',
    });
  }

  return alerts.slice(0, 8);
}

export function getWorkspaceAnalytics(workspaceId: number, userId: number) {
  const usageRows = db.prepare(`
    SELECT event_type AS eventType,
           date(created_at) AS day,
           COALESCE(SUM(quantity), 0) AS total
    FROM usage_events
    WHERE workspace_id = ?
      AND user_id = ?
      AND datetime(created_at) >= datetime('now', '-7 day')
    GROUP BY event_type, date(created_at)
    ORDER BY day ASC
  `).all(workspaceId, userId) as UsageEventRow[];

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS generatedTotal,
      SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS generated24h,
      SUM(CASE WHEN inbox_status = 'email_received' THEN 1 ELSE 0 END) AS emailReceived,
      SUM(CASE WHEN document_quality = 'verified' THEN 1 ELSE 0 END) AS verifiedDocuments,
      SUM(CASE WHEN document_quality != 'verified' THEN 1 ELSE 0 END) AS reviewDocuments
    FROM account_history
    WHERE workspace_id = ?
      AND created_by_user_id = ?
      AND datetime(created_at) >= datetime('now', '-7 day')
  `).get(workspaceId, userId) as Record<string, number | null>;

  const topGeos = db.prepare(`
    SELECT geo_key AS geoKey,
           geo_label AS geoLabel,
           COUNT(*) AS count
    FROM account_history
    WHERE workspace_id = ?
      AND created_by_user_id = ?
      AND datetime(created_at) >= datetime('now', '-7 day')
    GROUP BY geo_key, geo_label
    ORDER BY count DESC, geo_label ASC
    LIMIT 5
  `).all(workspaceId, userId) as Array<{ geoKey: string; geoLabel: string; count: number }>;

  return {
    windowDays: 7,
    totals: {
      generatedTotal: Number(totals.generatedTotal ?? 0),
      generated24h: Number(totals.generated24h ?? 0),
      emailReceived: Number(totals.emailReceived ?? 0),
      verifiedDocuments: Number(totals.verifiedDocuments ?? 0),
      reviewDocuments: Number(totals.reviewDocuments ?? 0),
    },
    usageByDay: usageRows.map((row) => ({
      day: row.day,
      eventType: row.eventType,
      total: Number(row.total ?? 0),
    })),
    topGeos: topGeos.map((row) => ({
      geoKey: row.geoKey,
      geoLabel: row.geoLabel,
      count: Number(row.count ?? 0),
    })),
  };
}

function buildLimitAlerts(id: string, label: string, used: number, limit: number, description: string): AlertItem[] {
  if (limit <= 0) {
    return [{
      id: `${id}-disabled`,
      tone: 'critical',
      title: `${label} disabled`,
      message: `The ${description} is set to 0.`,
      metric: '0 limit',
    }];
  }

  const ratio = used / limit;
  if (ratio >= 1) {
    return [{
      id: `${id}-limit-reached`,
      tone: 'critical',
      title: `${label} limit reached`,
      message: `${used} of ${limit} allowed actions have been used.`,
      metric: `${used}/${limit}`,
    }];
  }

  if (ratio >= 0.8) {
    return [{
      id: `${id}-limit-warning`,
      tone: 'warning',
      title: `${label} limit near`,
      message: `${used} of ${limit} allowed actions have been used.`,
      metric: `${used}/${limit}`,
    }];
  }

  return [];
}
