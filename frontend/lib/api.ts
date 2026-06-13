// Default to the frontend's /api path. In local dev, Next rewrites /api to the backend
// unless NEXT_PUBLIC_API_URL points to an explicit external API.
export const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || '/api';

export interface UserInfo {
  login: string;
  role: 'admin' | 'user';
  email?: string;
  username?: string;
  status?: string;
  workspaceId?: number;
  workspaceRole?: 'owner' | 'admin' | 'member' | 'viewer';
}
export interface GeoItem {
  key: string;
  label: string;
  documentTypes: string[];
}
export interface HistoryItem {
  id: number;
  geoKey: string;
  geoLabel: string;
  email: string;
  username: string;
  siteAccountId: string;
  firstName: string;
  lastName: string;
  phone: string;
  age: number;
  gender: 'male' | 'female';
  dateOfBirth: string;
  country: string;
  region: string;
  city: string;
  placeOfBirth: string;
  addressLine: string;
  postalCode: string;
  persona: 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';
  role: 'admin' | 'user';
  createdAt: string;
  documentType: string;
  documentIssueDate: string;
  documentQuality: 'verified' | 'synthetic_pattern' | 'missing_rules';
  inboxStatus?: 'waiting_for_email' | 'email_received' | 'no_email_found';
}

export interface UsageSummary {
  settings: {
    historyRetentionDays: number;
    historyLimit: number;
    allowBulkGeneration: boolean;
    maxBulkCount: number;
  };
  limits: {
    accountsPerDay: UsageLimit;
    mailboxesPerDay: UsageLimit;
    inboxRefreshPerMinute: UsageLimit;
  };
}

export interface UsageLimit {
  used: number;
  limit: number;
  remaining: number;
}

export interface UserSettings {
  defaultGeo: string;
  defaultPersona: 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';
  defaultDocumentType: string;
  bulkCount: number;
}

export interface WorkspaceSettings {
  historyRetentionDays: number;
  historyLimit: number;
  allowBulkGeneration: boolean;
  maxBulkCount: number;
  mailboxProvider: string;
  accountsPerDay: number;
  mailboxCreatePerDay: number;
  inboxRefreshPerMinute: number;
}

export interface WorkspaceMember {
  userId: number;
  login: string;
  email: string;
  username: string;
  userRole: string;
  workspaceRole: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

export interface WorkspaceInvite {
  id: number;
  workspaceId: number;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  status: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string;
  invitedByLogin: string;
  acceptedByLogin: string;
  token?: string;
}

export async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
