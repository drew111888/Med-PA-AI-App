
import { CaseRecord } from "../types.ts";
import { storage } from "./storageService.ts";

const HISTORY_KEY = 'medauth_case_history';

export const saveCaseRecord = async (record: Omit<CaseRecord, 'id' | 'timestamp'>) => {
  const history = await getCaseHistory();
  const newRecord: CaseRecord = {
    ...record,
    id: `case_${Date.now()}`,
    timestamp: new Date().toISOString()
  };
  history.unshift(newRecord);
  
  // Keep last 1000 for local performance, but save to storage wrapper
  const trimmedHistory = history.slice(0, 1000);
  await storage.set(HISTORY_KEY, trimmedHistory);
  return newRecord;
};

export const getCaseHistory = async (): Promise<CaseRecord[]> => {
  return await storage.get<CaseRecord[]>(HISTORY_KEY, []);
};

export const getDashboardStats = async () => {
  const history = await getCaseHistory();
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
