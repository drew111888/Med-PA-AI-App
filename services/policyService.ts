
import { MedicalPolicy, PolicyHistoryEntry } from "../types.ts";
import { storage } from "./storageService.ts";

const POLICIES_KEY = 'medauth_policies';

const DEFAULT_POLICIES: MedicalPolicy[] = [
  {
    id: '1',
    carrier: 'Aetna',
    title: 'Lumbar Spine MRI Guidelines',
    cptCodes: ['72148', '72149', '72158'],
    medications: [],
    tags: ['Radiology', 'Spine', 'Prior Auth'],
    content: 'Requires failed 6-week trial of conservative management including physical therapy or medication. Symptoms must include radicular pain below the knee or neurological deficit.',
    lastUpdated: '2023-11-01',
    history: []
  },
  {
    id: '2',
    carrier: 'UnitedHealthcare',
    title: 'Ocrevus (Ocrelizumab) Infusion',
    cptCodes: ['J2350'],
    medications: ['Ocrevus', 'Ocrelizumab'],
    tags: ['Neurology', 'Infusion', 'MS'],
    content: 'Patient must have a diagnosis of Relapsing Multiple Sclerosis (RMS) or Primary Progressive Multiple Sclerosis (PPMS). Must have trial and failure of at least one other DMT.',
    lastUpdated: '2023-12-15',
    history: []
  }
];

export const getPolicies = async (): Promise<MedicalPolicy[]> => {
  return await storage.get<MedicalPolicy[]>(POLICIES_KEY, DEFAULT_POLICIES);
};

export const savePolicy = async (policy: MedicalPolicy) => {
  const policies = await getPolicies();
  const index = policies.findIndex(p => p.id === policy.id);
  
  if (index >= 0) {
    const oldPolicy = policies[index];
    if (oldPolicy.content !== policy.content || oldPolicy.title !== policy.title) {
      const historyEntry: PolicyHistoryEntry = {
        timestamp: oldPolicy.lastUpdated,
        content: oldPolicy.content,
        title: oldPolicy.title
      };
      policy.history = [historyEntry, ...(oldPolicy.history || [])].slice(0, 10);
    } else {
      policy.history = oldPolicy.history;
    }
    policies[index] = policy;
  } else {
    policy.history = [];
    policies.push(policy);
  }
  
  await storage.set(POLICIES_KEY, policies);
};

export const deletePolicy = async (id: string) => {
  const policies = await getPolicies();
  const filtered = policies.filter(p => p.id !== id);
  await storage.set(POLICIES_KEY, filtered);
};

export const searchPolicies = async (query: string): Promise<MedicalPolicy[]> => {
  const q = query.toLowerCase();
  const policies = await getPolicies();
  return policies.filter(p => 
    p.carrier.toLowerCase().includes(q) ||
    p.title.toLowerCase().includes(q) ||
    p.cptCodes.some(c => c.includes(q)) ||
    p.medications.some(m => m.toLowerCase().includes(q))
  );
};
