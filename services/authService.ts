
import { User } from "../types.ts";
import { getAllUsers } from "./userService.ts";

export const getCurrentUser = (): User | null => {
  try {
    const session = localStorage.getItem('medauth_session');
    return session ? JSON.parse(session) : null;
  } catch (e) {
    console.error("Auth session retrieval failed", e);
    return null;
  }
};

export const login = (agreementSigned: boolean, user: User): User | null => {
  if (!agreementSigned || !user) return null;
  
  // Persist the specific user instance
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
