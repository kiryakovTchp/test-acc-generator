import db, { assertWorkspaceAccess, getDefaultWorkspaceForUser } from '../db.js';
import geoRules from '../geo-rules.json' with { type: 'json' };
import type { GeoRule, DocumentQuality, PersonaKey, Role, AccountBalanceStatus } from '../types.js';
import { fillTemplate, randomString, extractCodes, generatePersonaProfile, pickPrimaryVerificationLink, dedupeLinks, pickTemplate, randomPhone } from '../utils.js';
import type { EmailProvider } from '../providers/emailProvider.js';
import { ApiError, getWorkspaceSettings } from '../limits.js';
import { recordActivity } from '../activity.js';
import { getWorkspaceRole } from '../permissions.js';
import { decryptSensitive, decryptSensitiveNullable, encryptSensitive, encryptSensitiveNullable } from '../sensitiveData.js';

const rules = geoRules as unknown as GeoRule[];
const generationInboxWaitMs = Math.min(60000, Math.max(0, Number(process.env.GENERATION_INBOX_WAIT_MS ?? 15000)));

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
  emailProviderForAccount?: (providerKey: string | undefined) => EmailProvider;
  includeDebug?: boolean;
}) {
  cleanupOldHistory();
  const workspaceId = resolveWorkspace(input.userId, input.workspaceId);
  const geo = rules.find((rule) => rule.key === input.geoKey);
  if (!geo) throw new ApiError('unsupported_geo', 'Unsupported GEO');
  const docRule = geo.documents[input.documentType];
  const emailAccount = await input.emailProvider.createAccount();
  const inboxProvider = input.emailProviderForAccount?.(emailAccount.provider) ?? input.emailProvider;
  const profile = generatePersonaProfile(geo.key, input.persona);
  const inbox = await inboxProvider.fetchInbox(emailAccount.address, emailAccount.password, generationInboxWaitMs);
  const hydratedInbox = buildInboxPayload(inbox);

  let documentValue = 'Missing Rules';
  let quality: DocumentQuality = 'missing_rules';
  if (docRule) {
    documentValue = fillTemplate(pickTemplate(docRule.templates), { dateOfBirth: profile.dateOfBirth });
    quality = docRule.quality;
  }

  const username = `${geo.key}_${randomString(8)}`;
  const result = db.prepare(`
    INSERT INTO account_history (
      user_id, workspace_id, created_by_user_id, geo_key, geo_label, email, email_password, username,
      first_name, last_name, phone, age, gender, date_of_birth, country, region, city, place_of_birth, address_line, postal_code, persona,
      account_role, document_type, document_value, document_issue_date, document_quality, registration_url,
      mailbox_provider, inbox_status, inbox_sender, inbox_subject, inbox_received_at,
      inbox_plain_text, inbox_links_json, inbox_codes_json, inbox_html
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.userId,
    workspaceId,
    input.userId,
    geo.key,
    geo.label,
    emailAccount.address,
    encryptSensitive(emailAccount.password, 'account_history.email_password'),
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
    emailAccount.provider ?? 'mail_tm',
    hydratedInbox.status,
    hydratedInbox.sender,
    hydratedInbox.subject,
    hydratedInbox.receivedAt,
    encryptSensitiveNullable(hydratedInbox.plainText, 'account_history.inbox_plain_text'),
    encryptSensitive(JSON.stringify(hydratedInbox.links), 'account_history.inbox_links_json'),
    encryptSensitive(JSON.stringify(hydratedInbox.codes), 'account_history.inbox_codes_json'),
    encryptSensitiveNullable(hydratedInbox.rawHtml, 'account_history.inbox_html'),
  );

  trimHistoryForWorkspace(input.userId, workspaceId);
  const accountId = Number(result.lastInsertRowid);
  recordActivity({
    workspaceId,
    userId: input.userId,
    eventType: 'account_generated',
    entityType: 'account',
    entityId: accountId,
    summary: `Generated ${geo.label} ${input.documentType} test user`,
    metadata: {
      geoKey: geo.key,
      geoLabel: geo.label,
      documentType: input.documentType,
      role: input.role,
      inboxStatus: hydratedInbox.status,
    },
  });
  return getHistoryDetail(accountId, input.userId, input.includeDebug, workspaceId);
}

export async function refreshInbox(id: number, userId: number, emailProvider: EmailProvider, waitMs = 0, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const canEditShared = canEditSharedAccount(userId, resolvedWorkspaceId);
  const row = db.prepare(`
    SELECT *
    FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ? OR (shared_with_workspace = 1 AND ? = 1))
  `).get(id, resolvedWorkspaceId, userId, userId, userId, canEditShared ? 1 : 0) as any;
  if (!row) return null;
  const inbox = await emailProvider.fetchInbox(row.email, decryptSensitive(row.email_password, 'account_history.email_password'), waitMs);
  const hydratedInbox = buildInboxPayload(inbox);
  db.prepare(`
    UPDATE account_history
    SET inbox_status = ?, inbox_sender = ?, inbox_subject = ?, inbox_received_at = ?,
        inbox_plain_text = ?, inbox_links_json = ?, inbox_codes_json = ?, inbox_html = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ? OR (shared_with_workspace = 1 AND ? = 1))
  `).run(
    hydratedInbox.status,
    hydratedInbox.sender,
    hydratedInbox.subject,
    hydratedInbox.receivedAt,
    encryptSensitiveNullable(hydratedInbox.plainText, 'account_history.inbox_plain_text'),
    encryptSensitive(JSON.stringify(hydratedInbox.links), 'account_history.inbox_links_json'),
    encryptSensitive(JSON.stringify(hydratedInbox.codes), 'account_history.inbox_codes_json'),
    encryptSensitiveNullable(hydratedInbox.rawHtml, 'account_history.inbox_html'),
    id,
    resolvedWorkspaceId,
    userId,
    userId,
    userId,
    canEditShared ? 1 : 0,
  );
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export async function replaceMailbox(input: {
  id: number;
  userId: number;
  emailProvider: EmailProvider;
  emailProviderForAccount?: (providerKey: string | undefined) => EmailProvider;
  reserveMailboxCreation?: () => void;
  includeDebug?: boolean;
  workspaceId?: number;
}) {
  const resolvedWorkspaceId = resolveWorkspace(input.userId, input.workspaceId);
  const row = db.prepare(`
    SELECT email
    FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).get(input.id, resolvedWorkspaceId, input.userId, input.userId, input.userId) as { email: string } | undefined;
  if (!row) return null;
  input.reserveMailboxCreation?.();

  const emailAccount = await input.emailProvider.createAccount();
  const inboxProvider = input.emailProviderForAccount?.(emailAccount.provider) ?? input.emailProvider;
  const inbox = await inboxProvider.fetchInbox(emailAccount.address, emailAccount.password, generationInboxWaitMs);
  const hydratedInbox = buildInboxPayload(inbox);

  db.prepare(`
    UPDATE account_history
    SET email = ?,
        email_password = ?,
        mailbox_provider = ?,
        inbox_status = ?,
        inbox_sender = ?,
        inbox_subject = ?,
        inbox_received_at = ?,
        inbox_plain_text = ?,
        inbox_links_json = ?,
        inbox_codes_json = ?,
        inbox_html = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).run(
    emailAccount.address,
    encryptSensitive(emailAccount.password, 'account_history.email_password'),
    emailAccount.provider ?? 'mail_tm',
    hydratedInbox.status,
    hydratedInbox.sender,
    hydratedInbox.subject,
    hydratedInbox.receivedAt,
    encryptSensitiveNullable(hydratedInbox.plainText, 'account_history.inbox_plain_text'),
    encryptSensitive(JSON.stringify(hydratedInbox.links), 'account_history.inbox_links_json'),
    encryptSensitive(JSON.stringify(hydratedInbox.codes), 'account_history.inbox_codes_json'),
    encryptSensitiveNullable(hydratedInbox.rawHtml, 'account_history.inbox_html'),
    input.id,
    resolvedWorkspaceId,
    input.userId,
    input.userId,
    input.userId,
  );

  recordActivity({
    workspaceId: resolvedWorkspaceId,
    userId: input.userId,
    eventType: 'mailbox_replaced',
    entityType: 'account',
    entityId: input.id,
    summary: 'Replaced account mailbox',
    metadata: {
      previousEmail: row.email,
      nextEmail: emailAccount.address,
      mailboxProvider: emailAccount.provider ?? 'mail_tm',
      inboxStatus: hydratedInbox.status,
    },
  });

  return getHistoryDetail(input.id, input.userId, input.includeDebug, resolvedWorkspaceId);
}

export function getRefreshMailboxProviderKey(id: number, userId: number, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const canEditShared = canEditSharedAccount(userId, resolvedWorkspaceId);
  const row = db.prepare(`
    SELECT mailbox_provider as mailboxProvider
    FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ? OR (shared_with_workspace = 1 AND ? = 1))
  `).get(id, resolvedWorkspaceId, userId, userId, userId, canEditShared ? 1 : 0) as { mailboxProvider?: string } | undefined;
  return row?.mailboxProvider;
}

export function updateSiteAccountId(id: number, userId: number, siteAccountId: string, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const trimmed = siteAccountId.trim().slice(0, 80);
  const result = db.prepare(`
    UPDATE account_history
    SET site_account_id = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).run(trimmed, id, resolvedWorkspaceId, userId, userId, userId);
  if (result.changes === 0) return null;
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function updateAccountBalanceStatus(id: number, userId: number, balanceStatus: string, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const normalized = normalizeBalanceStatus(balanceStatus);
  const canEditShared = canEditSharedAccount(userId, resolvedWorkspaceId);
  const result = db.prepare(`
    UPDATE account_history
    SET balance_status = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ? OR (shared_with_workspace = 1 AND ? = 1))
  `).run(normalized, id, resolvedWorkspaceId, userId, userId, userId, canEditShared ? 1 : 0);
  if (result.changes === 0) return null;
  recordActivity({
    workspaceId: resolvedWorkspaceId,
    userId,
    eventType: 'balance_status_changed',
    entityType: 'account',
    entityId: id,
    summary: `Set balance status to ${balanceStatusLabel(normalized)}`,
    metadata: { balanceStatus: normalized },
  });
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function updatePhone(id: number, userId: number, phone: string, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const normalized = normalizeManualPhone(phone);
  const result = db.prepare(`
    UPDATE account_history
    SET phone = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).run(normalized, id, resolvedWorkspaceId, userId, userId, userId);
  if (result.changes === 0) return null;
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function regeneratePhone(id: number, userId: number, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const row = db.prepare(`
    SELECT geo_key as geoKey, phone
    FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).get(id, resolvedWorkspaceId, userId, userId, userId) as { geoKey: string; phone: string } | undefined;
  if (!row) return null;

  let nextPhone = randomPhone(row.geoKey);
  for (let attempt = 0; attempt < 5 && nextPhone === row.phone; attempt += 1) {
    nextPhone = randomPhone(row.geoKey);
  }

  db.prepare(`
    UPDATE account_history
    SET phone = ?
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).run(nextPhone, id, resolvedWorkspaceId, userId, userId, userId);
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function listHistory(userId: number, workspaceId?: number) {
  cleanupOldHistory();
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  return db.prepare(`
    SELECT ah.id,
           ah.geo_key as geoKey,
           ah.geo_label as geoLabel,
           ah.email,
           ah.username,
           ah.site_account_id as siteAccountId,
           ah.balance_status as balanceStatus,
           ah.first_name as firstName,
           ah.last_name as lastName,
           ah.phone,
           ah.age,
           ah.gender,
           ah.date_of_birth as dateOfBirth,
           ah.country,
           ah.region,
           ah.city,
           ah.place_of_birth as placeOfBirth,
           ah.address_line as addressLine,
           ah.postal_code as postalCode,
           ah.persona,
           ah.account_role as role,
           ah.created_at as createdAt,
           ah.document_type as documentType,
           ah.document_issue_date as documentIssueDate,
           ah.document_quality as documentQuality,
           ah.mailbox_provider as mailboxProvider,
           ah.inbox_status as inboxStatus,
           ah.created_by_user_id as createdByUserId,
           COALESCE(u.login, '') as createdByLogin,
           ah.shared_with_workspace as sharedWithWorkspace,
           ah.shared_at as sharedAt
    FROM account_history ah
    LEFT JOIN users u ON u.id = ah.created_by_user_id
    WHERE (ah.workspace_id = ? AND (ah.created_by_user_id = ? OR ah.user_id = ? OR ah.shared_with_workspace = 1))
       OR (ah.workspace_id IS NULL AND ah.user_id = ?)
    ORDER BY datetime(ah.created_at) DESC
    LIMIT ?
  `).all(resolvedWorkspaceId, userId, userId, userId, getWorkspaceSettings(resolvedWorkspaceId).history_limit);
}

export function getHistoryDetail(id: number, userId: number, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const row = db.prepare(`
    SELECT *
    FROM account_history
    WHERE id = ?
      AND (
        (workspace_id = ? AND (created_by_user_id = ? OR user_id = ? OR shared_with_workspace = 1))
        OR (workspace_id IS NULL AND user_id = ?)
      )
  `).get(id, resolvedWorkspaceId, userId, userId, userId) as any;
  if (!row) return null;
  const isCreator = row.created_by_user_id === userId || row.user_id === userId;
  const emailPassword = decryptSensitive(row.email_password, 'account_history.email_password');
  const inboxPlainText = decryptSensitiveNullable(row.inbox_plain_text, 'account_history.inbox_plain_text') ?? '';
  const inboxLinksJson = decryptSensitive(row.inbox_links_json, 'account_history.inbox_links_json');
  const inboxCodesJson = decryptSensitive(row.inbox_codes_json, 'account_history.inbox_codes_json');
  const inboxHtml = decryptSensitiveNullable(row.inbox_html, 'account_history.inbox_html');
  const inboxLinks = JSON.parse(inboxLinksJson);
  const inboxCodes = JSON.parse(inboxCodesJson);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    createdByLogin: getCreatedByLogin(row.created_by_user_id),
    sharedWithWorkspace: Boolean(row.shared_with_workspace),
    sharedAt: row.shared_at,
    geoKey: row.geo_key,
    geoLabel: row.geo_label,
    email: row.email,
    emailPassword,
    username: row.username,
    siteAccountId: row.site_account_id,
    balanceStatus: normalizeBalanceStatus(row.balance_status),
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
    mailboxProvider: row.mailbox_provider ?? 'mail_tm',
    fullProfileText: [
      `Account ID: ${row.site_account_id || ''}`,
      `Balance Status: ${balanceStatusLabel(normalizeBalanceStatus(row.balance_status))}`,
      `Username: ${row.username}`,
      `Email: ${row.email}`,
      `Mailbox Password: ${emailPassword}`,
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
      plainText: inboxPlainText,
      links: inboxLinks,
      primaryVerificationLink: pickPrimaryVerificationLink(inboxLinks),
      codes: inboxCodes,
      rawHtml: includeDebug && isCreator ? inboxHtml : null,
    },
    createdAt: row.created_at,
  };
}

function normalizeBalanceStatus(value: string): AccountBalanceStatus {
  if (value === 'has_balance' || value === 'no_balance') return value;
  return 'unknown';
}

function balanceStatusLabel(value: AccountBalanceStatus) {
  if (value === 'has_balance') return 'Has balance';
  if (value === 'no_balance') return 'No balance';
  return 'Unknown';
}

function normalizeManualPhone(value: string) {
  const phone = value.trim().replace(/\s+/g, ' ').slice(0, 40);
  const digitCount = phone.replace(/\D/g, '').length;
  if (digitCount < 6 || digitCount > 18) {
    throw new ApiError('invalid_phone', 'Phone must contain 6 to 18 digits', 400);
  }
  return phone;
}

export function deleteHistory(id: number, userId: number, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  db.prepare(`
    DELETE FROM account_history
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).run(id, resolvedWorkspaceId, userId, userId, userId);
}

export function updateHistorySharing(id: number, userId: number, sharedWithWorkspace: boolean, includeDebug = false, workspaceId?: number) {
  const resolvedWorkspaceId = resolveWorkspace(userId, workspaceId);
  const result = db.prepare(`
    UPDATE account_history
    SET shared_with_workspace = ?,
        shared_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ?
      AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
      AND (created_by_user_id = ? OR user_id = ?)
  `).run(sharedWithWorkspace ? 1 : 0, sharedWithWorkspace ? 1 : 0, id, resolvedWorkspaceId, userId, userId, userId);
  if (result.changes === 0) return null;
  recordActivity({
    workspaceId: resolvedWorkspaceId,
    userId,
    eventType: sharedWithWorkspace ? 'account_shared' : 'account_unshared',
    entityType: 'account',
    entityId: id,
    summary: sharedWithWorkspace ? 'Shared account with workspace' : 'Made account private',
    metadata: { sharedWithWorkspace },
  });
  return getHistoryDetail(id, userId, includeDebug, resolvedWorkspaceId);
}

export function cleanupOldHistory() {
  const workspaceResult = db.prepare(`
    DELETE FROM account_history
    WHERE workspace_id IS NOT NULL
      AND workspace_id IN (
        SELECT workspace_id
        FROM workspace_settings
        WHERE datetime(account_history.created_at) < datetime('now', '-' || history_retention_days || ' days')
      )
  `).run();
  const legacyResult = db.prepare(`DELETE FROM account_history WHERE workspace_id IS NULL AND datetime(created_at) < datetime('now', '-30 days')`).run();
  return Number(workspaceResult.changes ?? 0) + Number(legacyResult.changes ?? 0);
}

function trimHistoryForWorkspace(userId: number, workspaceId: number) {
  const historyLimit = getWorkspaceSettings(workspaceId).history_limit;
  db.prepare(`
    DELETE FROM account_history
    WHERE ((workspace_id = ? AND (created_by_user_id = ? OR user_id = ?)) OR (workspace_id IS NULL AND user_id = ?))
      AND id NOT IN (
      SELECT id
      FROM account_history
      WHERE (workspace_id = ? AND (created_by_user_id = ? OR user_id = ?)) OR (workspace_id IS NULL AND user_id = ?)
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    )
  `).run(workspaceId, userId, userId, userId, workspaceId, userId, userId, userId, historyLimit);
}

function resolveWorkspace(userId: number, workspaceId?: number) {
  if (workspaceId !== undefined) {
    return assertWorkspaceAccess(userId, workspaceId);
  }
  return getDefaultWorkspaceForUser(userId);
}

function canEditSharedAccount(userId: number, workspaceId: number) {
  const settings = getWorkspaceSettings(workspaceId);
  if ((settings.shared_account_editing ?? 'creator_only') !== 'owner_admin') return false;
  const role = getWorkspaceRole(userId, workspaceId);
  return role === 'owner' || role === 'admin';
}

function getCreatedByLogin(userId: number | null) {
  if (!userId) return '';
  const row = db.prepare('SELECT login FROM users WHERE id = ? LIMIT 1').get(userId) as { login: string } | undefined;
  return row?.login ?? '';
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
