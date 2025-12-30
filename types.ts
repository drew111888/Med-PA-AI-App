
export interface AnalysisResult {
  status: 'Likely Approved' | 'Likely Denied' | 'Insufficient Data';
  confidenceScore: number;
  reasoning: string;
  missingRequirements: string[];
  suggestedActionItems: string[];
  referenceQuotes: string[];
}

export interface AppealLetterRequest {
  patientName: string;
  policyNumber: string;
  insuranceProvider: string;
  denialReason: string;
  clinicalEvidence: string;
  cptCode: string;
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  ANALYZER = 'ANALYZER',
  APPEALS = 'APPEALS',
  HISTORY = 'HISTORY',
  LIBRARY = 'LIBRARY',
  SECURITY = 'SECURITY'
}

export interface PolicyHistoryEntry {
  timestamp: string;
  content: string;
  title: string;
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
}

export interface AuthRecord {
  id: string;
  date: string;
  patient: string;
  cpt: string;
  status: string;
  result: string;
}

export interface RedactionMapping {
  [key: string]: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resourceType: 'ANALYSIS' | 'APPEAL' | 'LOGIN' | 'POLICY_EXPORT';
  details: string;
  ipAddress: string;
}

export interface User {
  id: string;
  name: string;
  role: 'ADMIN' | 'PROVIDER' | 'BILLER';
  npi?: string;
}
