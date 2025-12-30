import { User } from "../types.ts";

export const getCurrentUser = (): User | null => {
  const session = localStorage.getItem('medauth_session');
  return session ? JSON.parse(session) : null;
};

export const login = (agreementSigned: boolean, role: User['role'] = 'PROVIDER'): User | null => {
  if (!agreementSigned) return null;
  
  const user: User = {
    id: `usr_${Math.random().toString(36).substr(2, 9)}`,
    name: role === 'ADMIN' ? 'System Administrator' : role === 'PROVIDER' ? 'Dr. Julian Bashir' : 'Finance Officer',
    role: role,
    npi: role === 'PROVIDER' ? '1234567890' : undefined
  };

  localStorage.setItem('medauth_session', JSON.stringify(user));
  return user;
};

export const logout = () => {
  localStorage.removeItem('medauth_session');
};

export const isAgreementSigned = (): boolean => {
  return localStorage.getItem('medauth_baa_agreement') === 'true';
};

export const signAgreement = () => {
  localStorage.setItem('medauth_baa_agreement', 'true');
};