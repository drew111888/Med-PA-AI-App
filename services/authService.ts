
import { User } from "../types.ts";
import { getAllUsers } from "./userService.ts";

export const getCurrentUser = (): User | null => {
  const session = localStorage.getItem('medauth_session');
  return session ? JSON.parse(session) : null;
};

export const login = (agreementSigned: boolean, role: User['role'] = 'PROVIDER'): User | null => {
  if (!agreementSigned) return null;
  
  // In a real app, this would verify credentials. 
  // Here we find the first user in the registry that matches the selected role for demo purposes.
  const users = getAllUsers();
  const matchedUser = users.find(u => u.role === role) || users[0];

  const user: User = { ...matchedUser };

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
