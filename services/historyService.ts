
import { CaseRecord } from "../types.ts";

const HISTORY_KEY = 'medauth_case_history';

export const saveCaseRecord = (record: Omit<CaseRecord, 'id' | 'timestamp'>) => {
  const history = getCaseHistory();
  const newRecord: CaseRecord = {
    ...record,
    id: `case_${Date.now()}`,
    timestamp: new Date().toISOString()
  };
  history.unshift(newRecord);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 1000))); // Keep last 1000
  return newRecord;
};

export const getCaseHistory = (): CaseRecord[] => {
  const stored = localStorage.getItem(HISTORY_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const getDashboardStats = () => {
  const history = getCaseHistory();
  const totalAnalyzed = history.filter(h => h.type === 'Analysis').length;
  const appealsGenerated = history.filter(h => h.type === 'Appeal').length;
  const riskFlags = history.filter(h => h.status === 'Likely Denied').length;
  
  const approved = history.filter(h => h.status === 'Likely Approved' || h.status === 'Approved').length;
  const totalCompleted = history.filter(h => h.status !== 'Insufficient Data').length;
  
  const approvalRate = totalCompleted > 0 ? Math.round((approved / totalCompleted) * 100) : 0;

  return {
    totalAnalyzed,
    appealsGenerated,
    riskFlags,
    approvalRate: `${approvalRate}%`
  };
};
