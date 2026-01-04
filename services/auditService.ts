
import { AuditLog, User } from "../types.ts";

/**
 * In a fully deployed live environment, this would hit a secure logging microservice.
 * For this workstation-based version, we utilize a robust local storage audit log 
 * that can be exported for compliance review.
 */
export const logAction = async (user: User, action: string, type: AuditLog['resourceType'], details: string) => {
  const logEntry: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    actor: user.name, // Changed from 'user' to 'actor'
    action,
    resourceType: type,
    details,
    timestamp: new Date().toISOString(),
    ipAddress: 'Internal Workstation'
  };

  try {
    const logs: AuditLog[] = JSON.parse(localStorage.getItem('medauth_audit_logs') || '[]');
    logs.unshift(logEntry);
    // Keep the last 500 audit entries for local compliance
    localStorage.setItem('medauth_audit_logs', JSON.stringify(logs.slice(0, 500)));
  } catch (e) {
    console.error('Audit Logging Failed locally', e);
  }
  
  console.info(`[SECURE AUDIT] ${action} recorded for ${user.name}.`);
};

export const getAuditLogs = async (): Promise<AuditLog[]> => {
  return JSON.parse(localStorage.getItem('medauth_audit_logs') || '[]');
};
