
/**
 * Data Portability Service
 * Handles aggregation of all local storage keys for workstation snapshots.
 */

const STORAGE_KEYS = [
  'medauth_users_registry',
  'medauth_practice_branding',
  'medauth_position_statements',
  'medauth_policies',
  'medauth_clinical_history',
  'medauth_audit_logs',
  'medauth_baa_agreement'
];

export const exportWorkstationData = () => {
  const backup: Record<string, string | null> = {};
  STORAGE_KEYS.forEach(key => {
    backup[key] = localStorage.getItem(key);
  });

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `medauth_snapshot_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importWorkstationData = async (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        Object.entries(data).forEach(([key, value]) => {
          if (STORAGE_KEYS.includes(key) && value !== null) {
            localStorage.setItem(key, value as string);
          }
        });
        resolve(true);
      } catch (err) {
        console.error("Failed to parse backup file", err);
        reject(false);
      }
    };
    reader.onerror = () => reject(false);
    reader.readAsText(file);
  });
};
