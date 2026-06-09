export type Role = 'admin' | 'user';
export type DocumentQuality = 'verified' | 'synthetic_pattern' | 'missing_rules';

export interface GeoRule {
  key: string;
  label: string;
  registrationUrl: string;
  documents: {
    [documentType: string]: {
      templates: string[];
      quality: Exclude<DocumentQuality, 'missing_rules'>;
      notes?: string;
    };
  };
}

export interface HistoryListItem {
  id: number;
  geoKey: string;
  geoLabel: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  createdAt: string;
  documentType: string;
  documentQuality: DocumentQuality;
}
