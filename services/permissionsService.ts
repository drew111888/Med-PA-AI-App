import { User, View } from "../types.ts";

export type Permission = 
  | 'view_dashboard'
  | 'run_clinical_analysis'
  | 'build_appeals'
  | 'manage_policies'
  | 'view_history'
  | 'view_audit_logs';

const ROLE_PERMISSIONS: Record<User['role'], Permission[]> = {
  ADMIN: [
    'view_dashboard',
    'run_clinical_analysis',
    'build_appeals',
    'manage_policies',
    'view_history',
    'view_audit_logs'
  ],
  PROVIDER: [
    'view_dashboard',
    'run_clinical_analysis',
    'build_appeals',
    'manage_policies', // Added to allow medical staff/providers to edit guidelines
    'view_history'
  ],
  BILLER: [
    'view_dashboard',
    'build_appeals',
    'view_history'
  ]
};

export const hasPermission = (user: User | null, permission: Permission): boolean => {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
};

export const canAccessView = (user: User | null, view: View): boolean => {
  if (!user) return false;
  switch (view) {
    case View.DASHBOARD: return hasPermission(user, 'view_dashboard');
    case View.ANALYZER: return hasPermission(user, 'run_clinical_analysis');
    case View.APPEALS: return hasPermission(user, 'build_appeals');
    case View.HISTORY: return hasPermission(user, 'view_history');
    case View.LIBRARY: return true; // Everyone can view the library
    default: return false;
  }
};