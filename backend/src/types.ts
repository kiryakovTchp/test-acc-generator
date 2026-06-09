export type Role = 'admin' | 'user';
export type DocumentQuality = 'verified' | 'synthetic_pattern' | 'missing_rules';
export type PersonaKey = 'standard_user' | 'young_user' | 'senior_user' | 'male_user' | 'female_user';
export type Gender = 'male' | 'female';

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
  age: number;
  gender: Gender;
  dateOfBirth: string;
  country: string;
  city: string;
  addressLine: string;
  postalCode: string;
  persona: PersonaKey;
  role: Role;
  createdAt: string;
  documentType: string;
  documentQuality: DocumentQuality;
}
