import db from '../db.js';
import geoRules from '../geo-rules.json' with { type: 'json' };
import type { GeoRule, DocumentQuality, Role } from '../types.js';
import { fillTemplate, randomString, extractLinks, extractCodes, randomPersonName, randomPhone } from '../utils.js';
import type { EmailProvider } from '../providers/emailProvider.js';

const rules = geoRules as unknown as GeoRule[];

export function listGeoRules() {
  return rules.map((rule) => ({
    key: rule.key,
    label: rule.label,
    registrationUrl: rule.registrationUrl,
    documentTypes: Object.keys(rule.documents),
  }));
}

export async function generateAccount(input: {
  userId: number;
  geoKey: string;
  documentType: string;
  role: Role;
  emailProvider: EmailProvider;
}) {
  cleanupOldHistory();
  const geo = rules.find((rule) => rule.key === input.geoKey);
  if (!geo) throw new Error('Unknown GEO');
  const docRule = geo.documents[input.documentType];
  const emailAccount = await input.emailProvider.createAccount();
  const person = randomPersonName();
  const phone = randomPhone(geo.key);
  const inbox = await input.emailProvider.fetchInbox(emailAccount.address, emailAccount.password);
  const plainText = inbox.map((msg) => msg.plainText).join('\n\n');
  const links = extractLinks(plainText);
  const codes = extractCodes(plainText);

  let documentValue = 'Missing Rules';
  let quality: DocumentQuality = 'missing_rules';
  if (docRule) {
    documentValue = fillTemplate(docRule.templates[0]);
    quality = docRule.quality;
  }

  const username = `${geo.key}_${randomString(8)}`;
  const result = db.prepare(`
    INSERT INTO account_history (
      user_id, geo_key, geo_label, email, email_password, username, first_name, last_name, phone, account_role,
      document_type, document_value, document_quality, registration_url,
      inbox_plain_text, inbox_links_json, inbox_codes_json, inbox_html
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.userId,
    geo.key,
    geo.label,
    emailAccount.address,
    emailAccount.password,
    username,
    person.firstName,
    person.lastName,
    phone,
    input.role,
    input.documentType,
    documentValue,
    quality,
    geo.registrationUrl,
    plainText,
    JSON.stringify(links),
    JSON.stringify(codes),
    inbox[0]?.html ?? null,
  );

  trimHistoryForUser(input.userId);
  return getHistoryDetail(Number(result.lastInsertRowid), input.userId);
}

export function listHistory(userId: number) {
  cleanupOldHistory();
  return db.prepare(`
    SELECT id, geo_key as geoKey, geo_label as geoLabel, email, username,
           first_name as firstName, last_name as lastName, phone,
           account_role as role, created_at as createdAt,
           document_type as documentType, document_quality as documentQuality
    FROM account_history
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 50
  `).all(userId);
}

export function getHistoryDetail(id: number, userId: number) {
  const row = db.prepare('SELECT * FROM account_history WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    geoKey: row.geo_key,
    geoLabel: row.geo_label,
    email: row.email,
    emailPassword: row.email_password,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.account_role,
    documentType: row.document_type,
    documentValue: row.document_value,
    documentQuality: row.document_quality,
    registrationUrl: row.registration_url,
    inbox: {
      plainText: row.inbox_plain_text ?? '',
      links: JSON.parse(row.inbox_links_json),
      codes: JSON.parse(row.inbox_codes_json),
      rawHtml: row.inbox_html,
    },
    createdAt: row.created_at,
  };
}

export function deleteHistory(id: number, userId: number) {
  db.prepare('DELETE FROM account_history WHERE id = ? AND user_id = ?').run(id, userId);
}

function cleanupOldHistory() {
  db.prepare(`DELETE FROM account_history WHERE datetime(created_at) < datetime('now', '-30 days')`).run();
}

function trimHistoryForUser(userId: number) {
  db.prepare(`
    DELETE FROM account_history
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM account_history WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 50
    )
  `).run(userId, userId);
}
