
import { AuthRecord, User } from "../types.ts";

const HISTORY_KEY = 'medauth_clinical_history';

export interface ExtendedRecord extends AuthRecord {
  type: 'Analysis' | 'Appeal';
  details?: any;
  userId: string;
  userName: string;
}

// Fixed signature: userId and userName are omitted from the record input because they are derived from the user argument.
export const saveRecord = (record: Omit<ExtendedRecord, 'id' | 'date' | 'userId' | 'userName'>, user: User) => {
  const history = getHistory();
  const newRecord: ExtendedRecord = {
    ...record,
    id: `rec_${Date.now()}`,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    userId: user.id,
    userName: user.name
  } as ExtendedRecord;
  
  history.unshift(newRecord);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 1000))); // Cap at 1k for performance
  return newRecord;
};

export const getHistory = (): ExtendedRecord[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

export const clearHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
};

export const getDashboardStats = () => {
  const history = getHistory();
  const analyzed = history.filter(r => r.type === 'Analysis');
  const appeals = history.filter(r => r.type === 'Appeal');
  const flags = analyzed.filter(r => r.status === 'Likely Denied').length;
  
  // Calculate a simulated approval rate based on non-denied analyses
  const likelyApproved = analyzed.filter(r => r.status === 'Likely Approved').length;
  const approvalRate = analyzed.length > 0 ? Math.round((likelyApproved / analyzed.length) * 100) : 0;

  return {
    totalAnalyzed: analyzed.length,
    riskFlags: flags,
    appealsGenerated: appeals.length,
    approvalRate: `${approvalRate}%`
  };
};
