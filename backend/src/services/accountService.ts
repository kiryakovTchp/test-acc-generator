import db, { assertWorkspaceAccess, getDefaultWorkspaceForUser } from '../db.js';
import geoRules from '../geo-rules.json' with { type: 'json' };
import type { GeoRule, DocumentQuality, PersonaKey, Role } from '../types.js';
import { fillTemplate, randomString, extractCodes, generatePersonaProfile, pickPrimaryVerificationLink, dedupeLinks } from '../utils.js';
import type { EmailProvider } from '../providers/emailProvider.js';

const rules = geoRules as unknown as GeoRule[];

export function listGeoRules() {
  return rules.map((rule) => ({
    key: rule.key,
    label: rule.label,
    documentTypes: Object.keys(rule.documents),
  }));
}

export async function generateAccount(input: {
  userId: number;
  workspaceId?: number;
  geoKey: string;
  documentType: string;
  role: Role;
  persona: PersonaKey;
  emailProvider: EmailProvider;
  includeDebug?: boolean;
}) {
  cleanupOldHistory();
  const workspaceId = resolveWorkspace(input.userId, input.workspaceId);
  const geo = rules.find((rule) => rule.key === input.geoKey);
  if (!geo) throw new Error('Unknown GEO');
  const docRule = geo.documents[input.documentType];
  const emailAccount = await input.emailProvider.createAccount();
  const profile = generatePersonaProfile(geo.key, input.persona);
  const inbox = await input.emailProvider.fetchInbox(emailAccount.address, emailAccount.password);
  const hydratedInbox = buildInboxPayload(inbox);

  let documentValue = 'Missing Rules';
  let quality: DocumentQuality = 'missing_rules';
  if (docRule) {
    documentValue = fillTemplate(docRule.templates[0]);
    quality = docRule.quality;
  }

  const username = `${geo.key}_${randomString(8)}`;
  const result = db.prepare(`
    INSERT INTO account_history (
      user_id, workspace_id, created_by_user_id, geo_key, geo_label, email, email_password, username,
      first_name, last_name, phone, age, gender, date_of_birth, country, region, city, place_of_birth, address_line, postal_code, persona,
      account_role, document_type, document_value, document_issue_date, document_quality, registration_url,
      inbox_status, inbox_sender, inbox_subject, inbox_received_at,
      inbox_plain_text, inbox_links_json, inbox_codes_json, inbox_html
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.userId,
    workspaceId,
    input.userId,
    geo.key,
    geo.label,
    emailAccount.address,
    emailAccount.password,
    username,
    profile.firstName,
    profile.lastName,
    profile.phone,
    profile.age,
    profile.gender,
    profile.dateOfBirth,
    profile.country,
    profile.region,
    profile.city,
    profile.placeOfBirth,
    profile.addressLine,
    profile.postalCode,
    profile.persona,
    input.role,
    input.documentType,
    documentValue,
    profile.documentIssueDate,
    quality,
    '',
    hydratedInbox.status,
    hydratedInbox.sender,
    hydratedInbox.subject,
    hydratedInbox.receivedAt,
    hydratedInbox.plainText,
    JSON.stringify(hydratedInbox.links),
    JSON.stringify(hydratedInbox.codes),
    hydratedInbox.rawHtml ?? null,
  );

  trimHistoryForWorkspace(input.userId, workspaceId);
  return getHistoryDetail(Number(result.lastInsertRowid), input.userId, input.includeDebug, workspaceId);
}

export async function refreshInbox(id: number, userId: number, emailProvider: EmailProvider, waitMs = 0, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const row = db.prepare(`
    SELECT *
    FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
  `).get(id, resolvedWorkspaceId, userId) as any;
  if (!row) return null;
  const inbox = await emailProvider.fetchInbox(row.email, row.email_password, waitMs);
  const hydratedInbox = buildInboxPayload(inbox);
  db.prepare(`
    UPDATE account_history
    SET inbox_status = ?, inbox_sender = ?, inbox_subject = ?, inbox_received_at = ?,
        inbox_plain_text = ?, inbox_links_json = ?, inbox_codes_json = ?, inbox_html = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
  `).run(
    hydratedInbox.status,
    hydratedInbox.sender,
    hydratedInbox.subject,
    hydratedInbox.receivedAt,
    hydratedInbox.plainText,
    JSON.stringify(hydratedInbox.links),
    JSON.stringify(hydratedInbox.codes),
    hydratedInbox.rawHtml ?? null,
    id,
    resolvedWorkspaceId,
    userId,
  );
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function updateSiteAccountId(id: number, userId: number, siteAccountId: string, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const trimmed = siteAccountId.trim().slice(0, 80);
  const result = db.prepare(`
    UPDATE account_history
    SET site_account_id = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
  `).run(trimmed, id, resolvedWorkspaceId, userId);
  if (result.changes === 0) return null;
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function listHistory(userId: number, workspaceId?: number) {
  cleanupOldHistory();
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  return db.prepare(`
    SELECT id, geo_key as geoKey, geo_label as geoLabel, email, username, site_account_id as siteAccountId,
           first_name as firstName, last_name as lastName, phone, age, gender,
           date_of_birth as dateOfBirth, country, region, city, place_of_birth as placeOfBirth,
           address_line as addressLine, postal_code as postalCode,
           persona, account_role as role, created_at as createdAt,
           document_type as documentType, document_issue_date as documentIssueDate, document_quality as documentQuality,
           inbox_status as inboxStatus
    FROM account_history
    WHERE workspace_id = ? OR (workspace_id IS NULL AND user_id = ?)
    ORDER BY datetime(created_at) DESC
    LIMIT 50
  `).all(resolvedWorkspaceId, userId);
}

export function getHistoryDetail(id: number, userId: number, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const row = db.prepare(`
    SELECT *
    FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
  `).get(id, resolvedWorkspaceId, userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    geoKey: row.geo_key,
    geoLabel: row.geo_label,
    email: row.email,
    emailPassword: row.email_password,
    username: row.username,
    siteAccountId: row.site_account_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    age: row.age,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    country: row.country,
    region: row.region,
    city: row.city,
    placeOfBirth: row.place_of_birth,
    addressLine: row.address_line,
    postalCode: row.postal_code,
    persona: row.persona,
    role: row.account_role,
    documentType: row.document_type,
    documentValue: row.document_value,
    documentIssueDate: row.document_issue_date,
    documentQuality: row.document_quality,
    fullProfileText: [
      `Account ID: ${row.site_account_id || ''}`,
      `Username: ${row.username}`,
      `Email: ${row.email}`,
      `Mailbox Password: ${row.email_password}`,
      `First Name: ${row.first_name}`,
      `Last Name: ${row.last_name}`,
      `Phone: ${row.phone}`,
      `Gender: ${row.gender}`,
      `Date of Birth: ${row.date_of_birth}`,
      `Age: ${row.age}`,
      `Country: ${row.country}`,
      `Region: ${row.region}`,
      `City: ${row.city}`,
      `Place of Birth: ${row.place_of_birth}`,
      `Address: ${row.address_line}`,
      `Postal Code: ${row.postal_code}`,
      `Document Type: ${row.document_type}`,
      `Document Number: ${row.document_value}`,
      `Document Issue Date: ${row.document_issue_date}`,
    ].join('\n'),
    inbox: {
      status: row.inbox_status,
      sender: row.inbox_sender,
      subject: row.inbox_subject,
      receivedAt: row.inbox_received_at,
      plainText: row.inbox_plain_text ?? '',
      links: JSON.parse(row.inbox_links_json),
      primaryVerificationLink: pickPrimaryVerificationLink(JSON.parse(row.inbox_links_json)),
      codes: JSON.parse(row.inbox_codes_json),
      rawHtml: includeDebug ? row.inbox_html : null,
    },
    createdAt: row.created_at,
  };
}

export function deleteHistory(id: number, userId: number, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  db.prepare(`
    DELETE FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
  `).run(id, resolvedWorkspaceId, userId);
}

function cleanupOldHistory() {
  db.prepare(`DELETE FROM account_history WHERE datetime(created_at) < datetime('now', '-30 days')`).run();
}

function trimHistoryForWorkspace(userId: number, workspaceId: number) {
  db.prepare(`
    DELETE FROM account_history
    WHERE (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND id NOT IN (
      SELECT id
      FROM account_history
      WHERE workspace_id = ? OR (workspace_id IS NULL AND user_id = ?)
      ORDER BY datetime(created_at) DESC
      LIMIT 50
    )
  `).run(workspaceId, userId, workspaceId, userId);
}

function resolveWorkspace(userId: number, workspaceId?: number) {
  if (workspaceId !== undefined) {
    return assertWorkspaceAccess(userId, workspaceId);
  }
  return getDefaultWorkspaceForUser(userId);
}

export function buildInboxPayload(inbox: Awaited<ReturnType<EmailProvider['fetchInbox']>>) {
  const firstMessage = inbox[0];
  const plainText = inbox.map((msg) => msg.cleanText ?? msg.plainText).filter(Boolean).join('\n\n');
  const rawHtml = inbox.map((msg) => msg.html).find(Boolean) ?? null;
  const links = dedupeLinks(inbox.flatMap((msg) => msg.links ?? []));
  return {
    status: firstMessage ? 'email_received' : 'no_email_found',
    sender: firstMessage?.sender ?? '',
    subject: firstMessage?.subject ?? '',
    receivedAt: firstMessage?.receivedAt ?? '',
    plainText,
    links,
    codes: extractCodes(plainText),
    rawHtml,
  };
}
