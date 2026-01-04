
export interface AnalysisResult {
  status: 'Likely Approved' | 'Likely Denied' | 'Insufficient Data';
  confidenceScore: number;
  reasoning: string;
  missingRequirements: string[];
  suggestedActionItems: string[];
  referenceQuotes: string[];
}

export type AppealType = 'Medical Necessity' | 'Expedited/Urgent' | 'Experimental/Investigational' | 'Peer-to-Peer Request';

export interface AppealLetterRequest {
  patientName: string;
  policyNumber: string;
  insuranceProvider: string;
  denialReason: string;
  clinicalEvidence: string;
  cptCode: string;
  templateType: AppealType;
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  ANALYZER = 'ANALYZER',
  APPEALS = 'APPEALS',
  HISTORY = 'HISTORY',
  LIBRARY = 'LIBRARY',
  USERS = 'USERS',
  SETTINGS = 'SETTINGS'
}

export interface CaseRecord {
  id: string;
  timestamp: string;
  patientName: string;
  cptCode: string;
  type: 'Analysis' | 'Appeal';
  status: string;
  details?: any;
}

export interface PolicyHistoryEntry {
  timestamp: string;
  content: string;
  title: string;
}

export interface PolicyDigest {
  summary: string;
  keyCriteria: string[];
  exclusionCriteria: string[];
  documentationChecklist: string[];
}

export interface MedicalPolicy {
  id: string;
  carrier: string;
  title: string;
  cptCodes: string[];
  medications: string[];
  tags: string[];
  content: string;
  lastUpdated: string;
  history?: PolicyHistoryEntry[];
  digest?: PolicyDigest;
}

export interface RedactionMapping {
  [key: string]: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resourceType: 'ANALYSIS' | 'APPEAL' | 'LOGIN' | 'POLICY_EXPORT' | 'USER_MANAGEMENT' | 'SYSTEM_SETTINGS';
  details: string;
  ipAddress: string;
}

export type UserRole = 'ADMIN' | 'CLINICAL' | 'ADMIN_STAFF';

export interface User {
  id: string;
  username: string;
  password?: string; // Only stored in local registry
  name: string;
  role: UserRole;
  npi?: string;
  email?: string;
  createdAt: string;
}

export interface PracticeSettings {
  practiceName: string;
  npi: string;
  taxId: string;
  enforceSecureMode: boolean;
  autoLogoutMinutes: number;
}
