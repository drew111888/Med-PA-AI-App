import { MedicalPolicy, PolicyHistoryEntry } from "../types.ts";

// Mock database for initial load
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
  },
  {
    id: '3',
    carrier: 'BlueCross BlueShield',
    title: 'Knee Arthroscopy Policy',
    cptCodes: ['29881', '29880'],
    medications: [],
    tags: ['Orthopedics', 'Surgery', 'Knee'],
    content: 'Must demonstrate objective evidence of mechanical locking or catching. Clinical findings must correlate with MRI results demonstrating meniscal tear.',
    lastUpdated: '2024-01-10',
    history: []
  }
];

export const getPolicies = (): MedicalPolicy[] => {
  const stored = localStorage.getItem('medauth_policies');
  if (!stored) {
    localStorage.setItem('medauth_policies', JSON.stringify(DEFAULT_POLICIES));
    return DEFAULT_POLICIES;
  }
  return JSON.parse(stored);
};

export const savePolicy = (policy: MedicalPolicy) => {
  const policies = getPolicies();
  const index = policies.findIndex(p => p.id === policy.id);
  
  if (index >= 0) {
    const oldPolicy = policies[index];
    
    // Check if substantial content changed to warrant a history entry
    if (oldPolicy.content !== policy.content || oldPolicy.title !== policy.title) {
      const historyEntry: PolicyHistoryEntry = {
        timestamp: oldPolicy.lastUpdated,
        content: oldPolicy.content,
        title: oldPolicy.title
      };
      
      // Keep last 10 versions
      const updatedHistory = [historyEntry, ...(oldPolicy.history || [])].slice(0, 10);
      policy.history = updatedHistory;
    } else {
      policy.history = oldPolicy.history;
    }
    
    policies[index] = policy;
  } else {
    policy.history = [];
    policies.push(policy);
  }
  
  localStorage.setItem('medauth_policies', JSON.stringify(policies));
};

export const deletePolicy = (id: string) => {
  const policies = getPolicies();
  const filtered = policies.filter(p => p.id !== id);
  localStorage.setItem('medauth_policies', JSON.stringify(filtered));
};

export const searchPolicies = (query: string): MedicalPolicy[] => {
  const q = query.toLowerCase();
  return getPolicies().filter(p => 
    p.carrier.toLowerCase().includes(q) ||
    p.title.toLowerCase().includes(q) ||
    p.cptCodes.some(c => c.includes(q)) ||
    p.medications.some(m => m.toLowerCase().includes(q)) ||
    (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
  );
};